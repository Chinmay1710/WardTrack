import csv
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.contrib.auth import authenticate

from rest_framework import status, views, viewsets
from rest_framework.response import Response
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    User, UserRole, Room, RoomStatus, Patient, Admission,
    AdmissionStatus, DischargeStatus, WaitingListEntry,
    TemperatureReading, DoctorVisit, VisitAddendum,
    DailyPatientSummary, CriticalAlert, AuditLog, SystemSetting,
    DayStatus
)
from .serializers import (
    UserSerializer, RoomSerializer, PatientSerializer,
    AdmissionSerializer, WaitingListEntrySerializer,
    TemperatureReadingSerializer, DoctorVisitSerializer,
    VisitAddendumSerializer, CriticalAlertSerializer,
    AuditLogSerializer, SystemSettingSerializer
)
from .permissions import (
    IsNurse, IsDoctor, IsHeadDoctor, IsAdminStaff,
    IsHospitalManager, CanViewOccupancy, CanViewReports
)
from .services import (
    log_audit, get_fever_threshold, calculate_patient_streak,
    calculate_day_status_for_date, evaluate_and_update_admission_discharge_status,
    check_mortality_alert
)


class LoginView(views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({'detail': 'Username and password required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=username, password=password)
        if not user:
            log_audit(
                None,
                'LOGIN_FAILED',
                'User',
                entity_id=username,
                reason="Invalid credentials supplied."
            )
            return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({'detail': 'User account is inactive.'}, status=status.HTTP_403_FORBIDDEN)

        refresh = RefreshToken.for_user(user)
        log_audit(
            user,
            'LOGIN_SUCCESS',
            'User',
            entity_id=user.id,
            reason="User logged in successfully."
        )

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data
        })


class CurrentUserView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class DashboardSummaryView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        active_admissions = Admission.objects.filter(status=AdmissionStatus.ACTIVE)
        total_active = active_admissions.count()
        total_rooms = Room.objects.count()
        occupied_rooms = Room.objects.filter(status=RoomStatus.OCCUPIED).count()
        vacant_rooms = Room.objects.filter(status=RoomStatus.VACANT).count()
        out_of_service_rooms = Room.objects.filter(status=RoomStatus.OUT_OF_SERVICE).count()

        # Check mortality alert status
        mortality_summary = check_mortality_alert()
        _, is_threshold_configured, is_head_confirmed, threshold_banner = get_fever_threshold()

        data = {
            'role': user.role,
            'total_active_patients': total_active,
            'occupancy': {
                'occupied': occupied_rooms,
                'total': total_rooms,
                'vacant': vacant_rooms,
                'out_of_service': out_of_service_rooms,
                'rate': round((occupied_rooms / total_rooms * 100), 1) if total_rooms else 0
            },
            'mortality': mortality_summary,
            'fever_threshold': {
                'is_configured': is_threshold_configured,
                'is_confirmed_by_head': is_head_confirmed,
                'banner': threshold_banner
            }
        }

        # Role-specific counts and worklist indicators
        if user.role == UserRole.NURSE:
            today_official_readings = TemperatureReading.objects.filter(
                date=today,
                is_additional=False,
                approval_status='APPROVED'
            ).values_list('admission_id', flat=True)
            
            pending_count = active_admissions.exclude(id__in=today_official_readings).count()
            done_count = len(today_official_readings)
            missing_count = DailyPatientSummary.objects.filter(status='MISSING', closed=True).count()

            data['counts'] = {
                'pending_temperature': pending_count,
                'done_temperature': done_count,
                'missing_readings': missing_count,
            }

        elif user.role == UserRole.DOCTOR:
            today_readings = TemperatureReading.objects.filter(
                date=today,
                approval_status='APPROVED'
            ).values_list('admission_id', flat=True)
            today_routine_visits = DoctorVisit.objects.filter(
                date=today,
                is_followup=False
            ).values_list('admission_id', flat=True)

            ready_count = active_admissions.filter(id__in=today_readings).exclude(id__in=today_routine_visits).count()
            waiting_count = active_admissions.exclude(id__in=today_readings).count()
            visited_count = active_admissions.filter(id__in=today_routine_visits).count()
            eligible_discharge_count = active_admissions.filter(discharge_status=DischargeStatus.ELIGIBLE).count()
            deferred_discharge_count = active_admissions.filter(discharge_status=DischargeStatus.DEFERRED).count()

            data['counts'] = {
                'ready_to_visit': ready_count,
                'waiting_for_temperature': waiting_count,
                'visited_today': visited_count,
                'eligible_for_discharge': eligible_discharge_count,
                'deferred_discharge': deferred_discharge_count,
            }

        elif user.role == UserRole.ADMIN:
            approved_discharge_count = active_admissions.filter(discharge_status=DischargeStatus.APPROVED).count()
            waiting_list_count = WaitingListEntry.objects.filter(is_admitted=False).count()

            data['counts'] = {
                'approved_for_discharge': approved_discharge_count,
                'vacant_rooms': vacant_rooms,
                'waiting_list': waiting_list_count,
                'out_of_service': out_of_service_rooms,
            }

        elif user.role == UserRole.MANAGER:
            missing_readings = DailyPatientSummary.objects.filter(status='MISSING', closed=True).count()
            missed_visits = DailyPatientSummary.objects.filter(visit_missed=True, closed=True).count()
            eligible_discharge = active_admissions.filter(discharge_status__in=[DischargeStatus.ELIGIBLE, DischargeStatus.APPROVED]).count()

            data['counts'] = {
                'active_patients': total_active,
                'closed_cases': mortality_summary['closed_cases'],
                'missing_readings': missing_readings,
                'missed_visits': missed_visits,
                'eligible_discharges': eligible_discharge,
            }

        return Response(data)


class PatientRegistrationView(views.APIView):
    permission_classes = [IsAdminStaff]

    def post(self, request):
        name = request.data.get('name')
        age = request.data.get('age')
        sex = request.data.get('sex')
        contact = request.data.get('contact', '')
        emergency_contact = request.data.get('emergency_contact', '')
        room_id = request.data.get('room_id')
        add_to_waiting = request.data.get('add_to_waiting_list', False)

        if not name or age is None or not sex:
            return Response({'detail': 'Name, age, and sex are required.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            patient = Patient.objects.create(
                name=name,
                age=age,
                sex=sex,
                contact=contact,
                emergency_contact=emergency_contact
            )

            # Check vacant rooms
            vacant_room_qs = Room.objects.filter(status=RoomStatus.VACANT)
            if not vacant_room_qs.exists() and not add_to_waiting:
                return Response({
                    'detail': 'No vacant rooms available. You may add the patient to the waiting list.',
                    'can_waitlist': True
                }, status=status.HTTP_400_BAD_REQUEST)

            if add_to_waiting or not room_id:
                if not vacant_room_qs.exists() or add_to_waiting:
                    entry = WaitingListEntry.objects.create(
                        patient=patient,
                        notes=request.data.get('notes', '')
                    )
                    log_audit(
                        request.user,
                        'WAITING_LIST_ADDED',
                        'WaitingListEntry',
                        entry.id,
                        new_value={'patient_name': patient.name},
                        reason="Patient added to waiting list due to room capacity."
                    )
                    return Response({
                        'detail': 'Patient registered and added to waiting list.',
                        'patient': PatientSerializer(patient).data,
                        'waiting_entry_id': entry.id
                    }, status=status.HTTP_201_CREATED)

            # Assign room atomically
            try:
                room = Room.objects.select_for_update().get(id=room_id)
            except Room.DoesNotExist:
                return Response({'detail': 'Selected room does not exist.'}, status=status.HTTP_404_NOT_FOUND)

            if room.status != RoomStatus.VACANT:
                return Response({'detail': 'This room was just taken.'}, status=status.HTTP_409_CONFLICT)

            room.status = RoomStatus.OCCUPIED
            room.save(update_fields=['status'])

            admission = Admission.objects.create(
                patient=patient,
                room=room,
                status=AdmissionStatus.ACTIVE,
                discharge_status=DischargeStatus.PENDING
            )

            log_audit(
                request.user,
                'PATIENT_REGISTERED_AND_ADMITTED',
                'Admission',
                admission.id,
                new_value={
                    'patient_id': patient.id,
                    'patient_name': patient.name,
                    'room_number': room.number
                },
                reason=f"Patient registered and admitted into room {room.number}."
            )

            return Response({
                'detail': f'Patient registered and admitted into Room {room.number}.',
                'admission': AdmissionSerializer(admission, context={'request': request}).data
            }, status=status.HTTP_201_CREATED)


class AdmissionViewSet(viewsets.ModelViewSet):
    serializer_class = AdmissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Admission.objects.all().select_related('patient', 'room')
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        discharge_status_param = self.request.query_params.get('discharge_status')
        if discharge_status_param:
            qs = qs.filter(discharge_status=discharge_status_param)
        return qs

    @action(detail=True, methods=['post'], permission_classes=[IsAdminStaff])
    def transfer_room(self, request, pk=None):
        target_room_id = request.data.get('target_room_id')
        if not target_room_id:
            return Response({'detail': 'Target room ID is required.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            admission = Admission.objects.select_for_update().get(pk=pk)
            if admission.status != AdmissionStatus.ACTIVE:
                return Response({'detail': 'Cannot transfer a non-active admission.'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                target_room = Room.objects.select_for_update().get(id=target_room_id)
            except Room.DoesNotExist:
                return Response({'detail': 'Target room does not exist.'}, status=status.HTTP_404_NOT_FOUND)

            if target_room.status != RoomStatus.VACANT:
                return Response({'detail': 'This room was just taken.'}, status=status.HTTP_409_CONFLICT)

            old_room = admission.room
            if old_room:
                old_room.status = RoomStatus.VACANT
                old_room.save(update_fields=['status'])

            target_room.status = RoomStatus.OCCUPIED
            target_room.save(update_fields=['status'])

            admission.room = target_room
            admission.save(update_fields=['room'])

            log_audit(
                request.user,
                'ROOM_TRANSFERRED',
                'Admission',
                admission.id,
                old_value={'room_number': old_room.number if old_room else None},
                new_value={'room_number': target_room.number},
                reason=request.data.get('reason', 'Administrative transfer')
            )

        return Response({
            'detail': f'Transferred to Room {target_room.number}.',
            'admission': AdmissionSerializer(admission, context={'request': request}).data
        })

    @action(detail=True, methods=['post'], permission_classes=[IsDoctor])
    def approve_discharge(self, request, pk=None):
        admission = self.get_object()
        if admission.status != AdmissionStatus.ACTIVE:
            return Response({'detail': 'Admission is not active.'}, status=status.HTTP_400_BAD_REQUEST)

        streak, _, is_eligible, _ = calculate_patient_streak(admission)
        _, is_configured, _, _ = get_fever_threshold()

        if not is_configured:
            return Response({'detail': 'Fever threshold is not configured. Cannot approve discharge.'}, status=status.HTTP_400_BAD_REQUEST)

        if streak < 3:
            return Response({'detail': f'Patient has only {streak} fever-free days. 3 consecutive days required.'}, status=status.HTTP_400_BAD_REQUEST)

        old_status = admission.discharge_status
        admission.discharge_status = DischargeStatus.APPROVED
        admission.discharge_approved_by = request.user
        admission.discharge_approved_at = timezone.now()
        admission.save(update_fields=['discharge_status', 'discharge_approved_by', 'discharge_approved_at'])

        log_audit(
            request.user,
            'DISCHARGE_APPROVED',
            'Admission',
            admission.id,
            old_value={'discharge_status': old_status},
            new_value={'discharge_status': DischargeStatus.APPROVED},
            reason="Doctor approved patient discharge after 3+ fever-free days."
        )

        return Response({'detail': 'Discharge approved.', 'discharge_status': admission.discharge_status})

    @action(detail=True, methods=['post'], permission_classes=[IsDoctor])
    def defer_discharge(self, request, pk=None):
        admission = self.get_object()
        reason = request.data.get('reason')
        if not reason:
            return Response({'detail': 'A reason is required to defer discharge.'}, status=status.HTTP_400_BAD_REQUEST)

        old_status = admission.discharge_status
        admission.discharge_status = DischargeStatus.DEFERRED
        admission.discharge_deferred_reason = reason
        admission.save(update_fields=['discharge_status', 'discharge_deferred_reason'])

        log_audit(
            request.user,
            'DISCHARGE_DEFERRED',
            'Admission',
            admission.id,
            old_value={'discharge_status': old_status},
            new_value={'discharge_status': DischargeStatus.DEFERRED, 'reason': reason},
            reason=reason
        )

        return Response({'detail': 'Discharge deferred.', 'discharge_status': admission.discharge_status})

    @action(detail=True, methods=['post'], permission_classes=[IsAdminStaff])
    def complete_discharge(self, request, pk=None):
        with transaction.atomic():
            admission = Admission.objects.select_for_update().get(pk=pk)
            if admission.status != AdmissionStatus.ACTIVE:
                return Response({'detail': 'Admission is not active.'}, status=status.HTTP_400_BAD_REQUEST)

            # Re-check: if a fever reading arrived after approval, cancel approval automatically
            threshold, _, _, _ = get_fever_threshold()
            today = timezone.localdate()
            today_status = calculate_day_status_for_date(admission, today, threshold)
            
            has_recent_fever = (today_status == DayStatus.FEVER)
            if not has_recent_fever and admission.discharge_approved_at:
                has_recent_fever = admission.temperature_readings.filter(
                    recorded_at__gte=admission.discharge_approved_at,
                    temperature_celsius__gte=threshold,
                    approval_status='APPROVED'
                ).exists()

            if has_recent_fever and admission.discharge_status == DischargeStatus.APPROVED:
                admission.discharge_status = DischargeStatus.PENDING
                admission.discharge_approved_by = None
                admission.discharge_approved_at = None
                admission.save(update_fields=['discharge_status', 'discharge_approved_by', 'discharge_approved_at'])

                log_audit(
                    request.user,
                    'DISCHARGE_APPROVAL_CANCELLED',
                    'Admission',
                    admission.id,
                    reason="Approval cancelled automatically: patient recorded fever reading before completion."
                )
                return Response({'detail': 'Approval cancelled: patient developed fever.'}, status=status.HTTP_400_BAD_REQUEST)

            if admission.discharge_status != DischargeStatus.APPROVED:
                return Response({'detail': 'Awaiting doctor approval.'}, status=status.HTTP_400_BAD_REQUEST)

            # Free room
            room = admission.room
            if room:
                room.status = RoomStatus.VACANT
                room.save(update_fields=['status'])

            admission.status = AdmissionStatus.DISCHARGED
            admission.discharged_at = timezone.now()
            admission.discharge_completed_by = request.user
            admission.room = None
            admission.save(update_fields=['status', 'discharged_at', 'discharge_completed_by', 'room'])

            log_audit(
                request.user,
                'DISCHARGE_COMPLETED',
                'Admission',
                admission.id,
                reason="Admin completed discharge and freed room."
            )

            # Recalculate mortality alert
            check_mortality_alert()

        return Response({'detail': 'Discharge completed successfully. Room is now vacant.'})

    @action(detail=True, methods=['post'], permission_classes=[IsDoctor])
    def record_death(self, request, pk=None):
        reason = request.data.get('notes', request.data.get('death_notes', ''))
        with transaction.atomic():
            admission = Admission.objects.select_for_update().get(pk=pk)
            if admission.status != AdmissionStatus.ACTIVE:
                return Response({'detail': 'Admission is not active.'}, status=status.HTTP_400_BAD_REQUEST)

            room = admission.room
            if room:
                room.status = RoomStatus.VACANT
                room.save(update_fields=['status'])

            admission.status = AdmissionStatus.DECEASED
            admission.discharged_at = timezone.now()
            admission.death_recorded_by = request.user
            admission.death_recorded_at = timezone.now()
            admission.death_notes = reason
            admission.room = None
            admission.save(update_fields=['status', 'discharged_at', 'death_recorded_by', 'death_recorded_at', 'death_notes', 'room'])

            log_audit(
                request.user,
                'DEATH_RECORDED',
                'Admission',
                admission.id,
                reason=reason or "Doctor recorded patient death."
            )

            # Recalculate mortality alert
            check_mortality_alert()

        return Response({'detail': 'Death recorded and room freed.'})


class TemperatureReadingViewSet(viewsets.ModelViewSet):
    serializer_class = TemperatureReadingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.ADMIN:
            # Admin staff cannot see temperature values or readings directly
            return TemperatureReading.objects.none()
        return TemperatureReading.objects.all().select_related('admission', 'recorded_by')

    def create(self, request, *args, **kwargs):
        user = request.user
        if user.role not in [UserRole.NURSE, UserRole.DOCTOR]:
            return Response({'detail': 'You do not have permission to do this.'}, status=status.HTTP_403_FORBIDDEN)

        admission_id = request.data.get('admission')
        try:
            admission = Admission.objects.get(id=admission_id)
        except Admission.DoesNotExist:
            return Response({'detail': 'Admission not found.'}, status=status.HTTP_404_NOT_FOUND)

        if admission.status != AdmissionStatus.ACTIVE:
            return Response({'detail': 'Temperature can only be recorded for active admissions.'}, status=status.HTTP_400_BAD_REQUEST)

        temp_val = request.data.get('temperature_celsius')
        if temp_val is None:
            return Response({'detail': 'Temperature value is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            temp_dec = Decimal(str(temp_val))
        except Exception:
            return Response({'detail': 'Invalid temperature format.'}, status=status.HTTP_400_BAD_REQUEST)

        confirm_out_of_range = request.data.get('confirm_out_of_range', False)
        if (temp_dec < Decimal('34.0') or temp_dec > Decimal('42.0')) and not confirm_out_of_range:
            return Response({
                'detail': f'Temperature {temp_dec}°C is outside plausible range (34.0°C - 42.0°C). Please confirm.',
                'requires_confirmation': True
            }, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        is_additional = request.data.get('is_additional', False)
        additional_reason = request.data.get('additional_reason', '')

        # Business rules:
        # Doctor may add an extra reading marked is_additional with a reason
        # Nurse records official reading
        if is_additional:
            if user.role != UserRole.DOCTOR:
                return Response({'detail': 'Only doctors can add additional clinical readings.'}, status=status.HTTP_403_FORBIDDEN)
            if not additional_reason:
                return Response({'detail': 'Reason is required for additional clinical readings.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Official reading: only one per calendar day
            existing = TemperatureReading.objects.filter(
                admission=admission,
                date=today,
                is_additional=False
            ).first()
            if existing:
                time_str = existing.recorded_at.strftime('%H:%M')
                nurse_name = existing.recorded_by.username
                return Response({
                    'detail': f'Temperature already recorded today at {time_str} by {nurse_name}.'
                }, status=status.HTTP_400_BAD_REQUEST)

        reading = TemperatureReading.objects.create(
            admission=admission,
            recorded_by=user,
            temperature_celsius=temp_dec,
            date=today,
            is_additional=is_additional,
            additional_reason=additional_reason,
            approval_status='APPROVED'
        )

        log_audit(
            user,
            'TEMPERATURE_RECORDED',
            'TemperatureReading',
            reading.id,
            new_value={
                'admission_id': admission.id,
                'patient_name': admission.patient.name,
                'temperature': str(temp_dec),
                'is_additional': is_additional
            },
            reason=additional_reason if is_additional else "Routine daily reading"
        )

        # Re-evaluate streak and discharge eligibility
        evaluate_and_update_admission_discharge_status(admission, user=user)

        return Response(TemperatureReadingSerializer(reading, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch', 'put'], permission_classes=[IsAuthenticated])
    def amend(self, request, pk=None):
        reading = self.get_object()
        user = request.user
        new_temp = request.data.get('temperature_celsius')
        reason = request.data.get('reason', request.data.get('amendment_reason', ''))

        if new_temp is None or not reason:
            return Response({'detail': 'New temperature and mandatory reason are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            temp_dec = Decimal(str(new_temp))
        except Exception:
            return Response({'detail': 'Invalid temperature format.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        old_temp = str(reading.temperature_celsius)

        if reading.date == today and reading.recorded_by == user:
            # Same day nurse amendment
            reading.temperature_celsius = temp_dec
            reading.amendment_reason = reason
            reading.save(update_fields=['temperature_celsius', 'amendment_reason'])

            log_audit(
                user,
                'TEMPERATURE_AMENDED',
                'TemperatureReading',
                reading.id,
                old_value={'temperature': old_temp},
                new_value={'temperature': str(temp_dec)},
                reason=reason
            )
            evaluate_and_update_admission_discharge_status(reading.admission, user=user)
            return Response({'detail': 'Reading amended successfully.', 'reading': TemperatureReadingSerializer(reading, context={'request': request}).data})

        # Older entry or different user requires Doctor approval
        if user.role == UserRole.DOCTOR:
            reading.temperature_celsius = temp_dec
            reading.amendment_reason = reason
            reading.approval_status = 'APPROVED'
            reading.approved_by = user
            reading.approved_at = timezone.now()
            reading.save(update_fields=['temperature_celsius', 'amendment_reason', 'approval_status', 'approved_by', 'approved_at'])

            log_audit(
                user,
                'TEMPERATURE_AMENDMENT_APPROVED',
                'TemperatureReading',
                reading.id,
                old_value={'temperature': old_temp},
                new_value={'temperature': str(temp_dec)},
                reason=f"Doctor approved correction: {reason}"
            )
            evaluate_and_update_admission_discharge_status(reading.admission, user=user)
            return Response({'detail': 'Doctor approved temperature correction.', 'reading': TemperatureReadingSerializer(reading, context={'request': request}).data})
        else:
            # Nurse requesting amendment on older entry
            reading.temperature_celsius = temp_dec
            reading.amendment_reason = reason
            reading.approval_status = 'PENDING_APPROVAL'
            reading.save(update_fields=['temperature_celsius', 'amendment_reason', 'approval_status'])

            log_audit(
                user,
                'TEMPERATURE_AMENDMENT_REQUESTED',
                'TemperatureReading',
                reading.id,
                old_value={'temperature': old_temp},
                new_value={'temperature': str(temp_dec), 'status': 'PENDING_APPROVAL'},
                reason=reason
            )
            return Response({'detail': 'Older entry amendment submitted for Doctor approval.'})

    @action(detail=True, methods=['post'], permission_classes=[IsDoctor])
    def approve_amendment(self, request, pk=None):
        reading = self.get_object()
        reading.approval_status = 'APPROVED'
        reading.approved_by = request.user
        reading.approved_at = timezone.now()
        reading.save(update_fields=['approval_status', 'approved_by', 'approved_at'])

        log_audit(
            request.user,
            'TEMPERATURE_AMENDMENT_APPROVED',
            'TemperatureReading',
            reading.id,
            reason="Doctor approved pending temperature amendment."
        )
        evaluate_and_update_admission_discharge_status(reading.admission, user=request.user)
        return Response({'detail': 'Amendment approved.'})


class DoctorVisitViewSet(viewsets.ModelViewSet):
    serializer_class = DoctorVisitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DoctorVisit.objects.all().select_related('admission', 'doctor')

    def create(self, request, *args, **kwargs):
        user = request.user
        if user.role != UserRole.DOCTOR:
            return Response({'detail': 'You do not have permission to do this.'}, status=status.HTTP_403_FORBIDDEN)

        admission_id = request.data.get('admission')
        treatment_notes = request.data.get('treatment_notes')
        is_urgent = request.data.get('is_urgent', False)
        urgent_reason = request.data.get('urgent_reason', '')
        is_followup = request.data.get('is_followup', False)

        if not admission_id or not treatment_notes:
            return Response({'detail': 'Admission ID and treatment notes are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            admission = Admission.objects.get(id=admission_id)
        except Admission.DoesNotExist:
            return Response({'detail': 'Admission not found.'}, status=status.HTTP_404_NOT_FOUND)

        if admission.status != AdmissionStatus.ACTIVE:
            return Response({'detail': 'Cannot visit a non-active patient.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()

        # Routine visit allowed only if today's temperature exists, else block:
        # "Temperature not recorded yet for this patient."
        has_today_reading = TemperatureReading.objects.filter(
            admission=admission,
            date=today,
            approval_status='APPROVED'
        ).exists()

        if not has_today_reading and not is_urgent:
            return Response({'detail': 'Temperature not recorded yet for this patient.'}, status=status.HTTP_400_BAD_REQUEST)

        if is_urgent and not urgent_reason:
            return Response({'detail': 'Mandatory reason required for urgent visit override.'}, status=status.HTTP_400_BAD_REQUEST)

        # One routine visit per day. Second attempt offers follow-up note instead.
        existing_routine_visit = DoctorVisit.objects.filter(
            admission=admission,
            date=today,
            is_followup=False
        ).first()

        if existing_routine_visit and not is_followup:
            return Response({
                'detail': 'Routine visit already recorded today. You may log a follow-up visit note instead.',
                'can_followup': True
            }, status=status.HTTP_400_BAD_REQUEST)

        visit = DoctorVisit.objects.create(
            admission=admission,
            doctor=user,
            date=today,
            treatment_notes=treatment_notes,
            is_urgent=is_urgent,
            urgent_reason=urgent_reason,
            is_followup=is_followup
        )

        log_audit(
            user,
            'DOCTOR_VISIT_RECORDED',
            'DoctorVisit',
            visit.id,
            new_value={
                'patient_name': admission.patient.name,
                'is_urgent': is_urgent,
                'is_followup': is_followup
            },
            reason=urgent_reason if is_urgent else "Daily clinical visit"
        )

        return Response(DoctorVisitSerializer(visit, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsDoctor])
    def add_addendum(self, request, pk=None):
        visit = self.get_object()
        note = request.data.get('note')
        if not note:
            return Response({'detail': 'Addendum note is required.'}, status=status.HTTP_400_BAD_REQUEST)

        addendum = VisitAddendum.objects.create(
            visit=visit,
            doctor=request.user,
            note=note
        )

        log_audit(
            request.user,
            'VISIT_ADDENDUM_ADDED',
            'VisitAddendum',
            addendum.id,
            reason=f"Addendum added to visit #{visit.id}"
        )

        return Response(VisitAddendumSerializer(addendum).data, status=status.HTTP_201_CREATED)


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.all().order_by('number')
    serializer_class = RoomSerializer
    permission_classes = [CanViewOccupancy]

    @action(detail=True, methods=['patch'], permission_classes=[IsAdminStaff])
    def mark_out_of_service(self, request, pk=None):
        room = self.get_object()
        is_out = request.data.get('out_of_service', True)

        if is_out:
            if room.status == RoomStatus.OCCUPIED:
                return Response({'detail': 'Cannot mark an occupied room as out of service.'}, status=status.HTTP_400_BAD_REQUEST)
            room.status = RoomStatus.OUT_OF_SERVICE
        else:
            room.status = RoomStatus.VACANT

        room.notes = request.data.get('notes', room.notes)
        room.save(update_fields=['status', 'notes'])

        log_audit(
            request.user,
            'ROOM_STATUS_CHANGED',
            'Room',
            room.id,
            new_value={'status': room.status},
            reason=f"Room marked as {room.get_status_display()}"
        )

        return Response(RoomSerializer(room).data)


class WaitingListViewSet(viewsets.ModelViewSet):
    queryset = WaitingListEntry.objects.filter(is_admitted=False).order_by('created_at')
    serializer_class = WaitingListEntrySerializer
    permission_classes = [IsAdminStaff]


class SystemSettingView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings = SystemSetting.objects.all()
        _, is_configured, is_head_confirmed, banner = get_fever_threshold()
        return Response({
            'settings': SystemSettingSerializer(settings, many=True).data,
            'threshold_info': {
                'is_configured': is_configured,
                'is_confirmed_by_head': is_head_confirmed,
                'banner': banner
            }
        })

    def post(self, request):
        # Setting change
        key = request.data.get('key')
        value = request.data.get('value')

        if not key or value is None:
            return Response({'detail': 'Key and value are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if key == 'fever_threshold_celsius':
            # "A doctor flagged is_head_doctor can change the fever threshold."
            if not (request.user.role == UserRole.DOCTOR and request.user.is_head_doctor):
                return Response({'detail': 'You do not have permission to do this.'}, status=status.HTTP_403_FORBIDDEN)

            try:
                dec_val = Decimal(str(value))
            except Exception:
                return Response({'detail': 'Invalid decimal threshold.'}, status=status.HTTP_400_BAD_REQUEST)

            setting, created = SystemSetting.objects.get_or_create(
                key='fever_threshold_celsius',
                defaults={'description': 'Fever threshold in Celsius', 'value': str(dec_val)}
            )
            old_val = setting.value
            setting.value = str(dec_val)
            setting.is_configured = True
            setting.is_confirmed_by_head = True
            setting.updated_by = request.user
            setting.save()

            log_audit(
                request.user,
                'FEVER_THRESHOLD_UPDATED',
                'SystemSetting',
                setting.id,
                old_value={'value': old_val},
                new_value={'value': str(dec_val)},
                reason=f"Head Doctor {request.user.username} confirmed fever threshold {dec_val}°C."
            )

            # Re-evaluate all active admissions
            for adm in Admission.objects.filter(status=AdmissionStatus.ACTIVE):
                evaluate_and_update_admission_discharge_status(adm, user=request.user)

            return Response({
                'detail': f'Fever threshold successfully updated to {dec_val}°C.',
                'setting': SystemSettingSerializer(setting).data
            })

        elif request.user.role == UserRole.MANAGER:
            setting, _ = SystemSetting.objects.get_or_create(key=key)
            old_val = setting.value
            setting.value = str(value)
            setting.updated_by = request.user
            setting.save()

            log_audit(
                request.user,
                'SETTING_UPDATED',
                'SystemSetting',
                setting.id,
                old_value={'value': old_val},
                new_value={'value': str(value)},
                reason=request.data.get('reason', 'Manager setting adjustment')
            )
            return Response({'detail': 'Setting updated.', 'setting': SystemSettingSerializer(setting).data})
        else:
            return Response({'detail': 'You do not have permission to do this.'}, status=status.HTTP_403_FORBIDDEN)


class ReportsView(views.APIView):
    permission_classes = [CanViewReports]

    def get(self, request):
        mortality = check_mortality_alert()
        
        # 30-day rolling rate
        thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
        recent_discharged = Admission.objects.filter(status=AdmissionStatus.DISCHARGED, discharged_at__gte=thirty_days_ago).count()
        recent_deceased = Admission.objects.filter(status=AdmissionStatus.DECEASED, death_recorded_at__gte=thirty_days_ago).count()
        recent_closed = recent_discharged + recent_deceased
        rolling_30d_mortality = round((recent_deceased / recent_closed * 100), 2) if recent_closed > 0 else 0.0

        # Occupancy
        total_rooms = Room.objects.count()
        occupied_rooms = Room.objects.filter(status=RoomStatus.OCCUPIED).count()

        # Missing readings & missed visits
        missing_readings_count = DailyPatientSummary.objects.filter(status='MISSING', closed=True).count()
        missed_visits_count = DailyPatientSummary.objects.filter(visit_missed=True, closed=True).count()

        # Extra days stayed
        extra_days_total = 0
        for adm in Admission.objects.filter(status=AdmissionStatus.ACTIVE):
            _, extra, _, _ = calculate_patient_streak(adm)
            extra_days_total += extra

        # Min cases check
        min_cases_setting = SystemSetting.objects.filter(key='min_closed_cases_for_alert').first()
        min_cases = int(min_cases_setting.value) if min_cases_setting else 10
        closed_cases_label = f"based on {mortality['closed_cases']} closed cases" if mortality['closed_cases'] < min_cases else None

        active_alert = CriticalAlert.objects.filter(is_active=True).first()

        return Response({
            'mortality_rate': mortality['mortality_rate'],
            'survival_rate': mortality['survival_rate'],
            'benchmark_line': 15.0,
            'survival_benchmark_line': 85.0,
            'rolling_30d_mortality': rolling_30d_mortality,
            'rolling_30d_warning': rolling_30d_mortality > 15.0,
            'closed_cases': mortality['closed_cases'],
            'discharged_count': mortality['discharged_count'],
            'deceased_count': mortality['deceased_count'],
            'closed_cases_label': closed_cases_label,
            'occupancy': {
                'occupied': occupied_rooms,
                'total': total_rooms,
                'rate': round(occupied_rooms / total_rooms * 100, 1) if total_rooms else 0
            },
            'missing_readings_count': missing_readings_count,
            'missed_visits_count': missed_visits_count,
            'extra_days_stayed_total': extra_days_total,
            'critical_alert': CriticalAlertSerializer(active_alert).data if active_alert else None
        })


class AcknowledgeAlertView(views.APIView):
    permission_classes = [IsHospitalManager]

    def post(self, request):
        alert_id = request.data.get('alert_id')
        comment = request.data.get('comment')

        if not comment:
            return Response({'detail': 'Comment is required to acknowledge critical alert.'}, status=status.HTTP_400_BAD_REQUEST)

        alert = CriticalAlert.objects.filter(is_active=True).first()
        if not alert:
            return Response({'detail': 'No active critical alert found.'}, status=status.HTTP_404_NOT_FOUND)

        alert.acknowledged_by = request.user
        alert.acknowledged_at = timezone.now()
        alert.acknowledgement_comment = comment
        alert.save(update_fields=['acknowledged_by', 'acknowledged_at', 'acknowledgement_comment'])

        log_audit(
            request.user,
            'ALERT_ACKNOWLEDGED',
            'CriticalAlert',
            alert.id,
            new_value={'acknowledged_by': request.user.username, 'comment': comment},
            reason=comment
        )

        return Response({
            'detail': 'Alert acknowledged.',
            'alert': CriticalAlertSerializer(alert).data
        })


class ExportCsvReportsView(views.APIView):
    permission_classes = [IsHospitalManager]

    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="facility_report_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'

        writer = csv.writer(response)
        writer.writerow(['Category', 'Metric', 'Value'])

        mortality = check_mortality_alert()
        total_rooms = Room.objects.count()
        occupied = Room.objects.filter(status=RoomStatus.OCCUPIED).count()
        missing_readings = DailyPatientSummary.objects.filter(status='MISSING', closed=True).count()
        missed_visits = DailyPatientSummary.objects.filter(visit_missed=True, closed=True).count()

        writer.writerow(['Mortality', 'Total Closed Cases', mortality['closed_cases']])
        writer.writerow(['Mortality', 'Discharged Cured', mortality['discharged_count']])
        writer.writerow(['Mortality', 'Deceased', mortality['deceased_count']])
        writer.writerow(['Mortality', 'Mortality Rate (%)', mortality['mortality_rate']])
        writer.writerow(['Mortality', 'Survival Rate (%)', mortality['survival_rate']])
        writer.writerow(['Mortality', 'Benchmark (%)', '15.0'])
        writer.writerow(['Occupancy', 'Total Rooms', total_rooms])
        writer.writerow(['Occupancy', 'Occupied Rooms', occupied])
        writer.writerow(['Compliance', 'Missing Readings', missing_readings])
        writer.writerow(['Compliance', 'Missed Visits', missed_visits])

        log_audit(
            request.user,
            'REPORTS_CSV_EXPORTED',
            'Report',
            reason="Manager exported facility metrics to CSV."
        )

        return response


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all().order_by('-timestamp')
    serializer_class = AuditLogSerializer
    permission_classes = [IsHospitalManager]


class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('username')
    serializer_class = UserSerializer
    permission_classes = [IsHospitalManager]

    def create(self, request, *args, **kwargs):
        username = request.data.get('username')
        password = request.data.get('password')
        role = request.data.get('role', UserRole.NURSE)
        is_head_doctor = request.data.get('is_head_doctor', False)

        if not username or not password:
            return Response({'detail': 'Username and password required.'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username=username).exists():
            return Response({'detail': 'Username already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(
            username=username,
            password=password,
            role=role,
            is_head_doctor=is_head_doctor if role == UserRole.DOCTOR else False
        )

        log_audit(
            request.user,
            'USER_CREATED',
            'User',
            user.id,
            new_value={'username': user.username, 'role': user.role},
            reason=f"Manager created new user {user.username}."
        )

        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
