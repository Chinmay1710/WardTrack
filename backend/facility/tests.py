from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from facility.models import (
    User, UserRole, Room, RoomStatus, Patient, Admission,
    AdmissionStatus, DischargeStatus, TemperatureReading,
    DoctorVisit, CriticalAlert, SystemSetting
)
from facility.services import calculate_patient_streak, check_mortality_alert


class FacilityBusinessRulesTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.nurse = User.objects.create_user(
            username='test_nurse', password='password123', role=UserRole.NURSE
        )
        self.doctor = User.objects.create_user(
            username='test_doctor', password='password123', role=UserRole.DOCTOR
        )
        self.head_doctor = User.objects.create_user(
            username='test_head_doctor', password='password123', role=UserRole.DOCTOR, is_head_doctor=True
        )
        self.admin = User.objects.create_user(
            username='test_admin', password='password123', role=UserRole.ADMIN
        )
        self.manager = User.objects.create_user(
            username='test_manager', password='password123', role=UserRole.MANAGER
        )

        # Settings
        self.threshold_setting = SystemSetting.objects.create(
            key='fever_threshold_celsius',
            value='37.5',
            is_configured=True,
            is_confirmed_by_head=True
        )

        # Room & Patient & Admission
        self.room = Room.objects.create(number=101, status=RoomStatus.OCCUPIED)
        self.patient = Patient.objects.create(
            name='John Doe', age=45, sex='MALE', contact='555-0100', emergency_contact='555-0101'
        )
        self.admission = Admission.objects.create(
            patient=self.patient,
            room=self.room,
            status=AdmissionStatus.ACTIVE,
            discharge_status=DischargeStatus.PENDING,
            admitted_at=timezone.now() - timedelta(days=10)
        )

    def test_duplicate_temperature_reading_blocked(self):
        """
        One official reading per patient per calendar day.
        Second attempt returns error: 'Temperature already recorded today at HH:MM by <nurse>.'
        """
        self.client.force_authenticate(user=self.nurse)

        # First recording
        res1 = self.client.post('/api/temperatures/', {
            'admission': self.admission.id,
            'temperature_celsius': '36.8'
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Second recording attempt on same day
        res2 = self.client.post('/api/temperatures/', {
            'admission': self.admission.id,
            'temperature_celsius': '36.9'
        })
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Temperature already recorded today at", res2.data['detail'])
        self.assertIn(self.nurse.username, res2.data['detail'])

    def test_streak_calculation_scenarios(self):
        """
        Verify streak calculation:
        (N N N, N M N N, N N F N N, F N N N)
        Note: N = Fever Free (< 37.5), F = Fever (>= 37.5), M = Missing
        Ordered from newest to oldest in day history.
        """
        today = timezone.localdate()
        threshold = Decimal('37.5')

        # Scenario A: N N N (3 fever-free days: day -2, day -1, today)
        TemperatureReading.objects.filter(admission=self.admission).delete()
        for i, days_ago in enumerate([2, 1, 0]):
            r_date = today - timedelta(days=days_ago)
            TemperatureReading.objects.create(
                admission=self.admission,
                recorded_by=self.nurse,
                temperature_celsius=Decimal('36.5'),
                date=r_date,
                recorded_at=timezone.make_aware(timezone.datetime.combine(r_date, timezone.datetime.min.time()) + timedelta(hours=8))
            )
        streak, extra, is_eligible, hist = calculate_patient_streak(self.admission, as_of_date=today)
        self.assertEqual(streak, 3, "N N N must yield a streak of 3")
        self.assertTrue(is_eligible)

        # Scenario B: N M N N (Newest to oldest: N, M, N, N)
        # Newest (today) = N, Yesterday = Missing (no reading), Day-2 = N, Day-3 = N
        TemperatureReading.objects.filter(admission=self.admission).delete()
        # Day-3: N
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.5'),
            date=today - timedelta(days=3)
        )
        # Day-2: N
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.5'),
            date=today - timedelta(days=2)
        )
        # Yesterday (Day-1): Missing (no reading)
        # Today: N
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.5'),
            date=today
        )
        streak, extra, is_eligible, hist = calculate_patient_streak(self.admission, as_of_date=today)
        # Streak from newest: today is N (+1), yesterday is M (stops!) -> streak = 1
        self.assertEqual(streak, 1, "N M N N must yield a streak of 1")
        self.assertFalse(is_eligible)

        # Scenario C: N N F N N (Newest to oldest: N, N, F, N, N)
        # Today = N, Day-1 = N, Day-2 = F (fever >= 37.5), Day-3 = N, Day-4 = N
        TemperatureReading.objects.filter(admission=self.admission).delete()
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.5'),
            date=today - timedelta(days=4)
        )
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.5'),
            date=today - timedelta(days=3)
        )
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('38.2'),
            date=today - timedelta(days=2)
        )
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.6'),
            date=today - timedelta(days=1)
        )
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.7'),
            date=today
        )
        streak, extra, is_eligible, hist = calculate_patient_streak(self.admission, as_of_date=today)
        # Newest: today=N (+1), day-1=N (+1), day-2=F (stops!) -> streak = 2
        self.assertEqual(streak, 2, "N N F N N must yield a streak of 2")
        self.assertFalse(is_eligible)

        # Scenario D: F N N N (Newest to oldest: N, N, N, F)
        # Today = N, Day-1 = N, Day-2 = N, Day-3 = F
        TemperatureReading.objects.filter(admission=self.admission).delete()
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('38.5'),
            date=today - timedelta(days=3)
        )
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.6'),
            date=today - timedelta(days=2)
        )
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.7'),
            date=today - timedelta(days=1)
        )
        TemperatureReading.objects.create(
            admission=self.admission, recorded_by=self.nurse, temperature_celsius=Decimal('36.8'),
            date=today
        )
        streak, extra, is_eligible, hist = calculate_patient_streak(self.admission, as_of_date=today)
        # Newest: today=N (+1), day-1=N (+1), day-2=N (+1), day-3=F (stops!) -> streak = 3
        self.assertEqual(streak, 3, "F N N N must yield a streak of 3")
        self.assertTrue(is_eligible)

    def test_doctor_visit_blocked_without_temperature(self):
        """
        Routine visit allowed only if today's temperature exists,
        else block: 'Temperature not recorded yet for this patient.'
        Urgent override with mandatory reason works.
        """
        self.client.force_authenticate(user=self.doctor)

        # Attempt routine visit when no temperature recorded today
        res = self.client.post('/api/visits/', {
            'admission': self.admission.id,
            'treatment_notes': 'Checking patient status.'
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['detail'], 'Temperature not recorded yet for this patient.')

        # Urgent override without reason fails
        res_urgent_fail = self.client.post('/api/visits/', {
            'admission': self.admission.id,
            'treatment_notes': 'Emergency visit',
            'is_urgent': True
        })
        self.assertEqual(res_urgent_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # Urgent override with reason succeeds
        res_urgent_ok = self.client.post('/api/visits/', {
            'admission': self.admission.id,
            'treatment_notes': 'Emergency visit conducted.',
            'is_urgent': True,
            'urgent_reason': 'Suspected acute respiratory complication.'
        })
        self.assertEqual(res_urgent_ok.status_code, status.HTTP_201_CREATED)

    def test_discharge_permissions_and_workflow(self):
        """
        - Nurse cannot approve discharge.
        - Doctor approves discharge once eligible (>=3 fever-free days).
        - Admin cannot complete discharge if not approved ('Awaiting doctor approval').
        - Admin completes discharge after doctor approves -> frees room.
        - Automatic cancellation if fever reading occurs after approval.
        """
        # Make patient eligible with 3 fever-free days
        today = timezone.localdate()
        for d in [2, 1, 0]:
            TemperatureReading.objects.create(
                admission=self.admission,
                recorded_by=self.nurse,
                temperature_celsius=Decimal('36.5'),
                date=today - timedelta(days=d)
            )

        # Nurse attempt to approve discharge -> 403 Forbidden
        self.client.force_authenticate(user=self.nurse)
        res_nurse = self.client.post(f'/api/admissions/{self.admission.id}/approve_discharge/')
        self.assertEqual(res_nurse.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_nurse.data['detail'], 'You do not have permission to do this.')

        # Admin attempt to complete discharge before approval -> 400 'Awaiting doctor approval'
        self.client.force_authenticate(user=self.admin)
        res_admin_early = self.client.post(f'/api/admissions/{self.admission.id}/complete_discharge/')
        self.assertEqual(res_admin_early.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_admin_early.data['detail'], 'Awaiting doctor approval.')

        # Doctor approves discharge
        self.client.force_authenticate(user=self.doctor)
        res_doc = self.client.post(f'/api/admissions/{self.admission.id}/approve_discharge/')
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)
        self.admission.refresh_from_db()
        self.assertEqual(self.admission.discharge_status, DischargeStatus.APPROVED)

        # Scenario: Fever arrives after approval
        # Doctor records an additional fever reading
        res_fever = self.client.post('/api/temperatures/', {
            'admission': self.admission.id,
            'temperature_celsius': '38.8',
            'is_additional': True,
            'additional_reason': 'Sudden fever spike noticed during evening round.'
        })
        self.assertEqual(res_fever.status_code, status.HTTP_201_CREATED)

        # Now admin tries to complete discharge -> blocked and approval cancelled!
        self.client.force_authenticate(user=self.admin)
        res_admin_blocked = self.client.post(f'/api/admissions/{self.admission.id}/complete_discharge/')
        self.assertEqual(res_admin_blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Approval cancelled: patient developed fever", res_admin_blocked.data['detail'])

        self.admission.refresh_from_db()
        self.assertEqual(self.admission.discharge_status, DischargeStatus.PENDING)

    def test_mortality_alert_boundary(self):
        """
        Closed cases = discharged + deceased.
        Critical alert strictly above 15% (deaths * 100 > 15 * closed):
        - 3 of 20 = 15% -> NO alert
        - 4 of 20 = 20% -> ALERT
        """
        # Clean previous closed cases
        Admission.objects.exclude(id=self.admission.id).delete()
        CriticalAlert.objects.all().delete()

        # Create 17 Discharged patients
        for i in range(17):
            p = Patient.objects.create(name=f'Discharged_{i}', age=30, sex='FEMALE', contact='555-1', emergency_contact='555-2')
            Admission.objects.create(patient=p, status=AdmissionStatus.DISCHARGED, discharged_at=timezone.now())

        # Create 3 Deceased patients -> Total 20 closed cases, 3 deaths = 15.0%
        for i in range(3):
            p = Patient.objects.create(name=f'Deceased_{i}', age=70, sex='MALE', contact='555-1', emergency_contact='555-2')
            Admission.objects.create(patient=p, status=AdmissionStatus.DECEASED, death_recorded_at=timezone.now())

        summary_3_of_20 = check_mortality_alert()
        self.assertEqual(summary_3_of_20['closed_cases'], 20)
        self.assertEqual(summary_3_of_20['deceased_count'], 3)
        self.assertEqual(summary_3_of_20['mortality_rate'], 15.0)
        self.assertFalse(summary_3_of_20['is_alert_active'], "3 of 20 (15%) must NOT raise an alert")
        self.assertFalse(CriticalAlert.objects.filter(is_active=True).exists())

        # Now convert 1 discharged into deceased, or add 1 deceased and remove 1 discharged so total is 20 with 4 deaths
        # 4 of 20 = 20.0% > 15%
        one_discharged = Admission.objects.filter(status=AdmissionStatus.DISCHARGED).first()
        one_discharged.status = AdmissionStatus.DECEASED
        one_discharged.save()

        summary_4_of_20 = check_mortality_alert()
        self.assertEqual(summary_4_of_20['closed_cases'], 20)
        self.assertEqual(summary_4_of_20['deceased_count'], 4)
        self.assertEqual(summary_4_of_20['mortality_rate'], 20.0)
        self.assertTrue(summary_4_of_20['is_alert_active'], "4 of 20 (20%) MUST raise critical alert")
        self.assertTrue(CriticalAlert.objects.filter(is_active=True).exists())
