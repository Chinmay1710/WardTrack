from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from django.core.exceptions import ValidationError

class UserRole(models.TextChoices):
    NURSE = 'NURSE', 'Nurse'
    DOCTOR = 'DOCTOR', 'Doctor'
    ADMIN = 'ADMIN', 'Admin Staff'
    MANAGER = 'MANAGER', 'Hospital Manager'

class User(AbstractUser):
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.NURSE)
    is_head_doctor = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        # Only doctors can be head doctors
        if self.role != UserRole.DOCTOR:
            self.is_head_doctor = False
        super().save(*args, **kwargs)

    def __str__(self):
        head = " (Head Doctor)" if self.is_head_doctor else ""
        return f"{self.username} [{self.get_role_display()}{head}]"


class SystemSetting(models.Model):
    key = models.CharField(max_length=50, unique=True)
    value = models.CharField(max_length=255)
    description = models.CharField(max_length=255, blank=True)
    is_configured = models.BooleanField(default=True)
    is_confirmed_by_head = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self):
        return f"{self.key}: {self.value} (Configured: {self.is_configured})"


class RoomStatus(models.TextChoices):
    VACANT = 'VACANT', 'Vacant'
    OCCUPIED = 'OCCUPIED', 'Occupied'
    OUT_OF_SERVICE = 'OUT_OF_SERVICE', 'Out of service'

class Room(models.Model):
    number = models.PositiveIntegerField(unique=True)
    status = models.CharField(max_length=20, choices=RoomStatus.choices, default=RoomStatus.VACANT)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['number']

    def __str__(self):
        return f"Room {self.number} ({self.get_status_display()})"


class Patient(models.Model):
    SEX_CHOICES = [
        ('MALE', 'Male'),
        ('FEMALE', 'Female'),
        ('OTHER', 'Other'),
    ]
    name = models.CharField(max_length=200)
    age = models.PositiveIntegerField()
    sex = models.CharField(max_length=20, choices=SEX_CHOICES)
    contact = models.CharField(max_length=100)
    emergency_contact = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} (Age: {self.age})"


class AdmissionStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    DISCHARGED = 'DISCHARGED', 'Discharged'
    DECEASED = 'DECEASED', 'Deceased'

class DischargeStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    ELIGIBLE = 'ELIGIBLE', 'Eligible'
    APPROVED = 'APPROVED', 'Approved'
    DEFERRED = 'DEFERRED', 'Deferred'

class Admission(models.Model):
    patient = models.ForeignKey(Patient, related_name='admissions', on_delete=models.CASCADE)
    room = models.ForeignKey(Room, related_name='admissions', null=True, blank=True, on_delete=models.SET_NULL)
    admitted_at = models.DateTimeField(default=timezone.now)
    discharged_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=AdmissionStatus.choices, default=AdmissionStatus.ACTIVE)
    
    discharge_status = models.CharField(max_length=20, choices=DischargeStatus.choices, default=DischargeStatus.PENDING)
    discharge_approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='discharges_approved')
    discharge_approved_at = models.DateTimeField(null=True, blank=True)
    discharge_deferred_reason = models.TextField(blank=True)
    discharge_completed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='discharges_completed')
    
    death_recorded_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='deaths_recorded')
    death_recorded_at = models.DateTimeField(null=True, blank=True)
    death_notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['room'],
                condition=models.Q(status='ACTIVE', room__isnull=False),
                name='unique_active_room_admission'
            )
        ]
        ordering = ['-admitted_at']

    def __str__(self):
        room_str = f"Room {self.room.number}" if self.room else "No Room"
        return f"Admission #{self.id}: {self.patient.name} ({room_str}) - {self.status}"


class WaitingListEntry(models.Model):
    patient = models.ForeignKey(Patient, related_name='waiting_entries', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)
    is_admitted = models.BooleanField(default=False)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Waiting: {self.patient.name} ({self.created_at.strftime('%Y-%m-%d')})"


class ReadingApprovalStatus(models.TextChoices):
    APPROVED = 'APPROVED', 'Approved'
    PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'

class TemperatureReading(models.Model):
    admission = models.ForeignKey(Admission, related_name='temperature_readings', on_delete=models.CASCADE)
    recorded_by = models.ForeignKey(User, related_name='temperatures_recorded', on_delete=models.PROTECT)
    temperature_celsius = models.DecimalField(max_digits=4, decimal_places=1)
    date = models.DateField(default=timezone.localdate)
    recorded_at = models.DateTimeField(default=timezone.now)
    is_additional = models.BooleanField(default=False)
    additional_reason = models.TextField(blank=True)
    amendment_reason = models.TextField(blank=True)
    approval_status = models.CharField(
        max_length=20,
        choices=ReadingApprovalStatus.choices,
        default=ReadingApprovalStatus.APPROVED
    )
    approved_by = models.ForeignKey(User, null=True, blank=True, related_name='temperatures_approved', on_delete=models.SET_NULL)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['admission', 'date'],
                condition=models.Q(is_additional=False),
                name='unique_official_reading_per_day'
            )
        ]
        ordering = ['-date', '-recorded_at']

    def __str__(self):
        type_str = "Additional" if self.is_additional else "Official"
        return f"{self.admission.patient.name}: {self.temperature_celsius}°C on {self.date} ({type_str})"


class DoctorVisit(models.Model):
    admission = models.ForeignKey(Admission, related_name='doctor_visits', on_delete=models.CASCADE)
    doctor = models.ForeignKey(User, related_name='visits_conducted', on_delete=models.PROTECT)
    date = models.DateField(default=timezone.localdate)
    visited_at = models.DateTimeField(default=timezone.now)
    treatment_notes = models.TextField()
    is_urgent = models.BooleanField(default=False)
    urgent_reason = models.TextField(blank=True)
    is_followup = models.BooleanField(default=False)
    is_missed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-date', '-visited_at']

    def __str__(self):
        return f"Visit for {self.admission.patient.name} by Dr. {self.doctor.username} on {self.date}"


class VisitAddendum(models.Model):
    visit = models.ForeignKey(DoctorVisit, related_name='addenda', on_delete=models.CASCADE)
    doctor = models.ForeignKey(User, on_delete=models.PROTECT)
    note = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Addendum to Visit #{self.visit.id} by Dr. {self.doctor.username}"


class DayStatus(models.TextChoices):
    FEVER = 'FEVER', 'Fever'
    FEVER_FREE = 'FEVER_FREE', 'Fever Free'
    MISSING = 'MISSING', 'Missing'

class DailyPatientSummary(models.Model):
    admission = models.ForeignKey(Admission, related_name='daily_summaries', on_delete=models.CASCADE)
    date = models.DateField()
    status = models.CharField(max_length=20, choices=DayStatus.choices)
    max_temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    visited = models.BooleanField(default=False)
    visit_missed = models.BooleanField(default=False)
    closed = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['admission', 'date'], name='unique_admission_day_summary')
        ]
        ordering = ['-date']

    def __str__(self):
        return f"{self.admission.patient.name} on {self.date}: {self.status}"


class CriticalAlert(models.Model):
    alert_type = models.CharField(max_length=50, default='MORTALITY_EXCEEDED')
    mortality_rate = models.DecimalField(max_digits=5, decimal_places=2)
    benchmark_rate = models.DecimalField(max_digits=5, decimal_places=2, default=15.0)
    deaths_count = models.PositiveIntegerField()
    closed_cases_count = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    raised_at = models.DateTimeField(default=timezone.now)
    cleared_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='acknowledged_alerts')
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledgement_comment = models.TextField(blank=True)

    class Meta:
        ordering = ['-raised_at']

    def __str__(self):
        return f"Mortality Alert {self.mortality_rate}% (Benchmark: {self.benchmark_rate}%) - Active: {self.is_active}"


class AuditLog(models.Model):
    timestamp = models.DateTimeField(default=timezone.now)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    username = models.CharField(max_length=150, default='System')
    role = models.CharField(max_length=50, blank=True)
    action = models.CharField(max_length=100)
    entity = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100, blank=True)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-timestamp']

    def save(self, *args, **kwargs):
        # Enforce append-only in Python layer
        if self.pk:
            raise ValidationError("Audit log entries are immutable and cannot be edited.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit log entries cannot be deleted.")

    def __str__(self):
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {self.username} ({self.role}): {self.action} on {self.entity} #{self.entity_id}"
