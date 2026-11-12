from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from .models import (
    Admission, AdmissionStatus, DischargeStatus, TemperatureReading,
    DoctorVisit, DailyPatientSummary, DayStatus, CriticalAlert,
    AuditLog, SystemSetting, UserRole
)

def log_audit(user, action, entity, entity_id='', old_value=None, new_value=None, reason=''):
    username = 'System'
    role = 'SYSTEM'
    user_obj = None

    if user and hasattr(user, 'is_authenticated') and user.is_authenticated:
        user_obj = user
        username = user.username
        role = getattr(user, 'role', 'USER')
    elif isinstance(user, str):
        username = user

    return AuditLog.objects.create(
        user=user_obj,
        username=username,
        role=role,
        action=action,
        entity=entity,
        entity_id=str(entity_id),
        old_value=old_value,
        new_value=new_value,
        reason=reason
    )


def get_fever_threshold():
    """
    Returns (threshold: Decimal, is_configured: bool, is_confirmed_by_head: bool, banner_text: str)
    """
    setting = SystemSetting.objects.filter(key='fever_threshold_celsius').first()
    if not setting:
        return Decimal('37.5'), False, False, "Fever threshold not configured. Demo only (37.5°C), must be confirmed by head doctor."
    
    try:
        val = Decimal(str(setting.value))
    except Exception:
        val = Decimal('37.5')

    banner_text = ""
    if not setting.is_configured or not setting.is_confirmed_by_head:
        banner_text = "Fever threshold is currently DEMO ONLY (must be confirmed by head doctor)."

    # Configured is true only if both is_configured and is_confirmed_by_head are true
    is_valid_configured = setting.is_configured and setting.is_confirmed_by_head
    return val, is_valid_configured, setting.is_confirmed_by_head, banner_text


def calculate_day_status_for_date(admission, check_date, threshold=None):
    """
    Computes DayStatus (FEVER, FEVER_FREE, MISSING, or PENDING if today has no readings yet)
    for a given date.
    """
    if threshold is None:
        threshold, _, _, _ = get_fever_threshold()

    readings = TemperatureReading.objects.filter(
        admission=admission,
        date=check_date,
        approval_status='APPROVED'
    )

    if not readings.exists():
        # Check if there is an existing DailyPatientSummary (e.g. from close_day)
        summary = DailyPatientSummary.objects.filter(admission=admission, date=check_date).first()
        if summary and summary.status == DayStatus.MISSING:
            return DayStatus.MISSING
        return None  # Pending / no reading

    # Any reading at or above threshold => FEVER
    for r in readings:
        if r.temperature_celsius >= threshold:
            return DayStatus.FEVER

    return DayStatus.FEVER_FREE


def calculate_patient_streak(admission, as_of_date=None):
    """
    Walk back from the newest day, skipping a pending today.
    FEVER_FREE adds 1, anything else stops.
    Returns (streak_count: int, extra_days_stayed: int, is_eligible: bool, day_history: list)
    """
    threshold, is_configured, _, _ = get_fever_threshold()

    if as_of_date is None:
        as_of_date = timezone.localdate()

    # Determine start date
    # First check if admission admitted_at is after as_of_date
    admitted_date = admission.admitted_at.date() if hasattr(admission.admitted_at, 'date') else admission.admitted_at
    if admitted_date > as_of_date:
        return 0, 0, False, []

    # Get all distinct dates from admitted_date to as_of_date
    # We walk backwards from as_of_date down to admitted_date
    current_date = as_of_date
    day_history = []
    
    # Check if today has readings
    today_readings = TemperatureReading.objects.filter(
        admission=admission,
        date=as_of_date,
        approval_status='APPROVED'
    ).exists()

    if not today_readings:
        # Today is pending, skip today
        current_date = as_of_date - timezone.timedelta(days=1)

    streak_count = 0
    stopped = False

    while current_date >= admitted_date:
        status = calculate_day_status_for_date(admission, current_date, threshold)
        if status is None:
            # If past date has no reading, it's considered MISSING
            status = DayStatus.MISSING

        day_history.append({
            'date': current_date.strftime('%Y-%m-%d'),
            'status': status
        })

        if not stopped:
            if status == DayStatus.FEVER_FREE:
                streak_count += 1
            else:
                stopped = True

        current_date -= timezone.timedelta(days=1)

    extra_days_stayed = max(0, streak_count - 3)
    is_eligible = (streak_count >= 3) and is_configured

    return streak_count, extra_days_stayed, is_eligible, day_history


def evaluate_and_update_admission_discharge_status(admission, user=None):
    """
    Evaluates streak and updates discharge_status if applicable.
    - If streak >= 3 and PENDING: auto-flag as ELIGIBLE.
    - If previously APPROVED or ELIGIBLE, but today has a FEVER or MISSING reading:
      cancel approval, revert to PENDING, audit log.
    """
    threshold, is_configured, _, _ = get_fever_threshold()
    streak, extra_days, is_eligible, _ = calculate_patient_streak(admission)

    today = timezone.localdate()
    today_status = calculate_day_status_for_date(admission, today, threshold)

    if today_status == DayStatus.FEVER:
        if admission.discharge_status == DischargeStatus.ELIGIBLE:
            old_status = admission.discharge_status
            admission.discharge_status = DischargeStatus.PENDING
            admission.save(update_fields=['discharge_status'])
            log_audit(
                user or 'System',
                'DISCHARGE_ELIGIBILITY_REVOKED',
                'Admission',
                admission.id,
                old_value={'discharge_status': old_status},
                new_value={'discharge_status': DischargeStatus.PENDING},
                reason="Automatic revocation: patient recorded fever reading."
            )
            return admission.discharge_status

    if is_eligible and admission.discharge_status == DischargeStatus.PENDING:
        admission.discharge_status = DischargeStatus.ELIGIBLE
        admission.save(update_fields=['discharge_status'])
        log_audit(
            user or 'System',
            'DISCHARGE_FLAGGED_ELIGIBLE',
            'Admission',
            admission.id,
            old_value={'discharge_status': DischargeStatus.PENDING},
            new_value={'discharge_status': DischargeStatus.ELIGIBLE},
            reason=f"Patient achieved {streak} consecutive fever-free days."
        )

    return admission.discharge_status


def check_mortality_alert():
    """
    Closed cases = discharged cured + deceased.
    Mortality = deaths / closed x 100.
    Critical alert when deaths * 100 > 15 * closed (strictly above 15).
    """
    discharged_count = Admission.objects.filter(status=AdmissionStatus.DISCHARGED).count()
    deceased_count = Admission.objects.filter(status=AdmissionStatus.DECEASED).count()
    closed_cases = discharged_count + deceased_count

    if closed_cases == 0:
        mortality_rate = Decimal('0.00')
        survival_rate = Decimal('0.00')
        is_exceeded = False
    else:
        # Strictly above 15%: deaths * 100 > 15 * closed
        is_exceeded = (deceased_count * 100) > (15 * closed_cases)
        mortality_rate = Decimal((deceased_count / closed_cases) * 100).quantize(Decimal('0.01'))
        survival_rate = Decimal((discharged_count / closed_cases) * 100).quantize(Decimal('0.01'))

    active_alert = CriticalAlert.objects.filter(is_active=True).first()

    if is_exceeded:
        if not active_alert:
            active_alert = CriticalAlert.objects.create(
                alert_type='MORTALITY_EXCEEDED',
                mortality_rate=mortality_rate,
                benchmark_rate=Decimal('15.00'),
                deaths_count=deceased_count,
                closed_cases_count=closed_cases,
                is_active=True,
                raised_at=timezone.now()
            )
            log_audit(
                'System',
                'CRITICAL_ALERT_RAISED',
                'CriticalAlert',
                active_alert.id,
                old_value=None,
                new_value={
                    'mortality_rate': str(mortality_rate),
                    'deaths': deceased_count,
                    'closed_cases': closed_cases
                },
                reason=f"Mortality rate {mortality_rate}% strictly exceeds 15% benchmark."
            )
        else:
            active_alert.mortality_rate = mortality_rate
            active_alert.deaths_count = deceased_count
            active_alert.closed_cases_count = closed_cases
            active_alert.save(update_fields=['mortality_rate', 'deaths_count', 'closed_cases_count'])
    else:
        if active_alert:
            active_alert.is_active = False
            active_alert.cleared_at = timezone.now()
            active_alert.save(update_fields=['is_active', 'cleared_at'])
            log_audit(
                'System',
                'CRITICAL_ALERT_CLEARED',
                'CriticalAlert',
                active_alert.id,
                old_value={'is_active': True},
                new_value={'is_active': False, 'cleared_at': str(active_alert.cleared_at)},
                reason=f"Mortality rate {mortality_rate}% is at or below the 15% benchmark."
            )

    return {
        'closed_cases': closed_cases,
        'discharged_count': discharged_count,
        'deceased_count': deceased_count,
        'mortality_rate': float(mortality_rate),
        'survival_rate': float(survival_rate),
        'is_alert_active': is_exceeded,
        'active_alert': active_alert
    }


def close_day_service(date_to_close=None):
    """
    Management command close_day service:
    Marks patients with no reading on date_to_close as MISSING.
    Flags patients with a reading but no visit as 'Visit missed'.
    Breaks fever-free streak for missing day.
    """
    if date_to_close is None:
        # Default to yesterday or current date if manually specified
        date_to_close = timezone.localdate() - timezone.timedelta(days=1)

    active_admissions = Admission.objects.filter(
        status=AdmissionStatus.ACTIVE,
        admitted_at__date__lte=date_to_close
    )

    threshold, _, _, _ = get_fever_threshold()
    updated_summaries = []

    for admission in active_admissions:
        readings = TemperatureReading.objects.filter(
            admission=admission,
            date=date_to_close,
            approval_status='APPROVED'
        )
        visits = DoctorVisit.objects.filter(
            admission=admission,
            date=date_to_close
        )

        has_reading = readings.exists()
        has_visit = visits.exists()

        if not has_reading:
            day_status = DayStatus.MISSING
            max_temp = None
            visit_missed = False
        else:
            max_temp = max(r.temperature_celsius for r in readings)
            day_status = DayStatus.FEVER if max_temp >= threshold else DayStatus.FEVER_FREE
            visit_missed = not has_visit

        summary, created = DailyPatientSummary.objects.update_or_create(
            admission=admission,
            date=date_to_close,
            defaults={
                'status': day_status,
                'max_temperature': max_temp,
                'visited': has_visit,
                'visit_missed': visit_missed,
                'closed': True
            }
        )
        updated_summaries.append(summary)

        # Re-evaluate discharge eligibility
        evaluate_and_update_admission_discharge_status(admission)

    log_audit(
        'System',
        'CLOSE_DAY_EXECUTED',
        'DailyPatientSummary',
        entity_id=str(date_to_close),
        new_value={'date': str(date_to_close), 'patients_processed': len(active_admissions)},
        reason="Daily closure command executed."
    )

    return len(updated_summaries)
