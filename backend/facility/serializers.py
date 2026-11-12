from rest_framework import serializers
from .models import (
    User, Room, Patient, Admission, WaitingListEntry,
    TemperatureReading, DoctorVisit, VisitAddendum,
    DailyPatientSummary, CriticalAlert, AuditLog, SystemSetting,
    UserRole
)
from .services import calculate_patient_streak, get_fever_threshold

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'role', 'is_head_doctor', 'is_active']
        read_only_fields = ['id']


class RoomSerializer(serializers.ModelSerializer):
    active_admission = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ['id', 'number', 'status', 'notes', 'active_admission']

    def get_active_admission(self, obj):
        active_adm = obj.admissions.filter(status='ACTIVE').first()
        if not active_adm:
            return None
        return {
            'admission_id': active_adm.id,
            'patient_id': active_adm.patient.id,
            'patient_name': active_adm.patient.name,
            'admitted_at': active_adm.admitted_at,
            'discharge_status': active_adm.discharge_status,
        }


class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ['id', 'name', 'age', 'sex', 'contact', 'emergency_contact', 'created_at']
        read_only_fields = ['id', 'created_at']


class WaitingListEntrySerializer(serializers.ModelSerializer):
    patient_name = serializers.ReadOnlyField(source='patient.name')
    patient_age = serializers.ReadOnlyField(source='patient.age')
    patient_sex = serializers.ReadOnlyField(source='patient.sex')

    class Meta:
        model = WaitingListEntry
        fields = ['id', 'patient', 'patient_name', 'patient_age', 'patient_sex', 'notes', 'created_at', 'is_admitted']
        read_only_fields = ['id', 'created_at']


class TemperatureReadingSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.ReadOnlyField(source='recorded_by.username')
    approved_by_name = serializers.ReadOnlyField(source='approved_by.username')
    confirm_out_of_range = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = TemperatureReading
        fields = [
            'id', 'admission', 'temperature_celsius', 'date', 'recorded_at',
            'recorded_by', 'recorded_by_name', 'is_additional', 'additional_reason',
            'amendment_reason', 'approval_status', 'approved_by', 'approved_by_name',
            'approved_at', 'confirm_out_of_range'
        ]
        read_only_fields = ['id', 'recorded_at', 'recorded_by', 'approval_status', 'approved_by', 'approved_at', 'date']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        # Admin Staff: "Cannot see temperature values or treatment notes"
        if request and request.user and request.user.role == UserRole.ADMIN:
            ret.pop('temperature_celsius', None)
        return ret


class VisitAddendumSerializer(serializers.ModelSerializer):
    doctor_name = serializers.ReadOnlyField(source='doctor.username')

    class Meta:
        model = VisitAddendum
        fields = ['id', 'visit', 'doctor', 'doctor_name', 'note', 'created_at']
        read_only_fields = ['id', 'doctor', 'created_at']


class DoctorVisitSerializer(serializers.ModelSerializer):
    doctor_name = serializers.ReadOnlyField(source='doctor.username')
    addenda = VisitAddendumSerializer(many=True, read_only=True)

    class Meta:
        model = DoctorVisit
        fields = [
            'id', 'admission', 'doctor', 'doctor_name', 'date', 'visited_at',
            'treatment_notes', 'is_urgent', 'urgent_reason', 'is_followup',
            'is_missed', 'addenda'
        ]
        read_only_fields = ['id', 'doctor', 'visited_at', 'date', 'is_missed']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        # Admin Staff cannot see treatment notes
        if request and request.user and request.user.role == UserRole.ADMIN:
            ret.pop('treatment_notes', None)
            ret.pop('addenda', None)
            ret.pop('urgent_reason', None)
        return ret


class AdmissionSerializer(serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    room_number = serializers.ReadOnlyField(source='room.number')
    temperature_readings = serializers.SerializerMethodField()
    doctor_visits = serializers.SerializerMethodField()
    streak_info = serializers.SerializerMethodField()
    today_status = serializers.SerializerMethodField()

    class Meta:
        model = Admission
        fields = [
            'id', 'patient', 'room', 'room_number', 'admitted_at', 'discharged_at',
            'status', 'discharge_status', 'discharge_approved_by', 'discharge_approved_at',
            'discharge_deferred_reason', 'discharge_completed_by', 'death_recorded_by',
            'death_recorded_at', 'death_notes', 'temperature_readings', 'doctor_visits',
            'streak_info', 'today_status'
        ]
        read_only_fields = ['id', 'admitted_at', 'discharged_at']

    def get_streak_info(self, obj):
        streak, extra_days, is_eligible, day_history = calculate_patient_streak(obj)
        _, is_configured, _, _ = get_fever_threshold()
        return {
            'streak_count': streak,
            'extra_days_stayed': extra_days,
            'is_eligible': is_eligible,
            'is_threshold_configured': is_configured,
            'day_history': day_history
        }

    def get_today_status(self, obj):
        from django.utils import timezone
        today = timezone.localdate()
        today_readings = obj.temperature_readings.filter(date=today, approval_status='APPROVED')
        today_visits = obj.doctor_visits.filter(date=today)
        has_temp = today_readings.exists()
        has_visit = today_visits.exists()
        return {
            'has_temperature_today': has_temp,
            'has_visit_today': has_visit,
            'ready_for_visit': has_temp and not has_visit,
            'waiting_for_temperature': not has_temp,
            'visited_today': has_visit
        }

    def get_temperature_readings(self, obj):
        request = self.context.get('request')
        # Admin staff cannot see temperature values
        if request and request.user and request.user.role == UserRole.ADMIN:
            return []
        readings = obj.temperature_readings.all().order_by('-date', '-recorded_at')
        return TemperatureReadingSerializer(readings, many=True, context=self.context).data

    def get_doctor_visits(self, obj):
        request = self.context.get('request')
        visits = obj.doctor_visits.all().order_by('-date', '-visited_at')
        return DoctorVisitSerializer(visits, many=True, context=self.context).data


class CriticalAlertSerializer(serializers.ModelSerializer):
    acknowledged_by_name = serializers.ReadOnlyField(source='acknowledged_by.username')

    class Meta:
        model = CriticalAlert
        fields = [
            'id', 'alert_type', 'mortality_rate', 'benchmark_rate', 'deaths_count',
            'closed_cases_count', 'is_active', 'raised_at', 'cleared_at',
            'acknowledged_by', 'acknowledged_by_name', 'acknowledged_at',
            'acknowledgement_comment'
        ]
        read_only_fields = ['id', 'raised_at', 'cleared_at']


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            'id', 'timestamp', 'user', 'username', 'role', 'action',
            'entity', 'entity_id', 'old_value', 'new_value', 'reason'
        ]
        read_only_fields = fields


class SystemSettingSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.ReadOnlyField(source='updated_by.username')

    class Meta:
        model = SystemSetting
        fields = [
            'id', 'key', 'value', 'description', 'is_configured',
            'is_confirmed_by_head', 'updated_at', 'updated_by', 'updated_by_name'
        ]
        read_only_fields = ['id', 'updated_at', 'updated_by']

