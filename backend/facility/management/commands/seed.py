from decimal import Decimal
import random
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from facility.models import (
    User, UserRole, Room, RoomStatus, Patient, Admission,
    AdmissionStatus, DischargeStatus, WaitingListEntry,
    TemperatureReading, DoctorVisit, DailyPatientSummary,
    DayStatus, CriticalAlert, AuditLog, SystemSetting
)
from facility.services import check_mortality_alert, log_audit

class Command(BaseCommand):
    help = 'Seeds database with 74 rooms, demo users, realistic patient histories, and scenarios.'

    def handle(self, *args, **options):
        self.stdout.write("Starting database seed...")

        with transaction.atomic():
            # 1. Clean existing data
            AuditLog.objects.all().delete()
            DailyPatientSummary.objects.all().delete()
            DoctorVisit.objects.all().delete()
            TemperatureReading.objects.all().delete()
            WaitingListEntry.objects.all().delete()
            Admission.objects.all().delete()
            Patient.objects.all().delete()
            Room.objects.all().delete()
            CriticalAlert.objects.all().delete()
            SystemSetting.objects.all().delete()
            User.objects.all().delete()

            # 2. Create Users
            users_data = [
                ('nurse1', 'pass123', UserRole.NURSE, False, 'Florence', 'Nightingale'),
                ('doctor1', 'pass123', UserRole.DOCTOR, False, 'Gregory', 'House'),
                ('doctor_head', 'pass123', UserRole.DOCTOR, True, 'Elizabeth', 'Blackwell'),
                ('admin1', 'pass123', UserRole.ADMIN, False, 'Arthur', 'Dent'),
                ('manager1', 'pass123', UserRole.MANAGER, False, 'Sarah', 'Connor'),
            ]

            user_objs = {}
            for username, pwd, role, is_head, fn, ln in users_data:
                u = User.objects.create_user(
                    username=username,
                    password=pwd,
                    role=role,
                    is_head_doctor=is_head,
                    first_name=fn,
                    last_name=ln
                )
                user_objs[username] = u

            self.stdout.write(self.style.SUCCESS("Demo users created."))

            # 3. System Settings
            SystemSetting.objects.create(
                key='fever_threshold_celsius',
                value='37.5',
                description='Fever threshold in Celsius (demo only, must be confirmed by head doctor)',
                is_configured=True,
                is_confirmed_by_head=False
            )
            SystemSetting.objects.create(
                key='min_closed_cases_for_alert',
                value='10',
                description='Minimum closed cases required for definitive alert benchmark',
                is_configured=True,
                is_confirmed_by_head=True
            )
            SystemSetting.objects.create(
                key='occupancy_amber_threshold_percent',
                value='90',
                description='Occupancy percentage to trigger amber alert',
                is_configured=True,
                is_confirmed_by_head=True
            )

            # 4. Create 74 Rooms
            rooms = []
            for num in range(1, 75):
                status = RoomStatus.VACANT
                if num in [73, 74]:
                    status = RoomStatus.OUT_OF_SERVICE
                r = Room.objects.create(
                    number=num,
                    status=status,
                    notes="Maintenance in progress" if status == RoomStatus.OUT_OF_SERVICE else ""
                )
                rooms.append(r)

            self.stdout.write(self.style.SUCCESS("74 Rooms created."))

            # 5. Seed Historical Discharged and Deceased Cases (12 Discharged Cured + 3 Deceased = 15 closed cases, 20% mortality -> Critical Alert Active!)
            today = timezone.localdate()
            doctor = user_objs['doctor1']
            admin = user_objs['admin1']
            nurse = user_objs['nurse1']

            first_names = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen"]
            last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson"]

            def make_name(idx):
                return f"{first_names[idx % len(first_names)]} {last_names[(idx * 3) % len(last_names)]}_{idx}"

            # 12 Discharged Cured
            for i in range(1, 13):
                p = Patient.objects.create(
                    name=make_name(i + 100),
                    age=random.randint(22, 68),
                    sex=random.choice(['MALE', 'FEMALE']),
                    contact=f"+1-555-01{i:02d}",
                    emergency_contact=f"+1-555-99{i:02d}"
                )
                adm = Admission.objects.create(
                    patient=p,
                    room=None,
                    status=AdmissionStatus.DISCHARGED,
                    discharge_status=DischargeStatus.APPROVED,
                    discharge_approved_by=doctor,
                    discharge_approved_at=timezone.now() - timedelta(days=random.randint(5, 20)),
                    discharge_completed_by=admin,
                    admitted_at=timezone.now() - timedelta(days=random.randint(21, 35)),
                    discharged_at=timezone.now() - timedelta(days=random.randint(2, 19))
                )

            # 3 Deceased Patients
            for i in range(1, 4):
                p = Patient.objects.create(
                    name=make_name(i + 200),
                    age=random.randint(65, 88),
                    sex=random.choice(['MALE', 'FEMALE']),
                    contact=f"+1-555-02{i:02d}",
                    emergency_contact=f"+1-555-98{i:02d}"
                )
                adm = Admission.objects.create(
                    patient=p,
                    room=None,
                    status=AdmissionStatus.DECEASED,
                    death_recorded_by=doctor,
                    death_recorded_at=timezone.now() - timedelta(days=random.randint(1, 10)),
                    death_notes="Severe complications and respiratory distress.",
                    admitted_at=timezone.now() - timedelta(days=random.randint(12, 25)),
                    discharged_at=timezone.now() - timedelta(days=random.randint(1, 10))
                )

            # 6. Seed Active Patients in Rooms 1 to 55
            # Scenarios:
            # Rooms 1-5: Pending Temperature today (Waiting for temperature for doctor)
            # Rooms 6-15: Ready to visit (Temp recorded today ~36.8, no visit yet)
            # Rooms 16-25: Visited today (Temp recorded today, doctor routine visit logged)
            # Rooms 26-31: Eligible for discharge (3+ consecutive fever-free days, PENDING approval)
            # Rooms 32-36: Approved for discharge (Doctor approved, ready for Admin complete discharge)
            # Rooms 37-40: Missing day in past (breaks streak)
            # Rooms 41-55: Active treatment / mixed fever history

            for room_num in range(1, 56):
                r = rooms[room_num - 1]
                r.status = RoomStatus.OCCUPIED
                r.save(update_fields=['status'])

                p = Patient.objects.create(
                    name=make_name(room_num),
                    age=random.randint(18, 75),
                    sex=random.choice(['MALE', 'FEMALE', 'OTHER']),
                    contact=f"+1-555-10{room_num:02d}",
                    emergency_contact=f"+1-555-80{room_num:02d}"
                )

                # Set admission date
                days_admitted = random.randint(5, 14)
                adm_time = timezone.now() - timedelta(days=days_admitted)

                discharge_status = DischargeStatus.PENDING
                approved_by = None
                approved_at = None

                if 32 <= room_num <= 36:
                    discharge_status = DischargeStatus.APPROVED
                    approved_by = doctor
                    approved_at = timezone.now() - timedelta(hours=2)
                elif 26 <= room_num <= 31:
                    discharge_status = DischargeStatus.ELIGIBLE

                adm = Admission.objects.create(
                    patient=p,
                    room=r,
                    status=AdmissionStatus.ACTIVE,
                    discharge_status=discharge_status,
                    discharge_approved_by=approved_by,
                    discharge_approved_at=approved_at,
                    admitted_at=adm_time
                )

                # Generate past days readings (from adm_time.date() to yesterday)
                curr_date = adm_time.date()
                yesterday = today - timedelta(days=1)

                is_missing_scenario = (37 <= room_num <= 40)
                is_eligible_scenario = (26 <= room_num <= 36)

                while curr_date <= yesterday:
                    # In missing day scenario, leave 2 days ago with NO reading
                    if is_missing_scenario and curr_date == (today - timedelta(days=2)):
                        DailyPatientSummary.objects.create(
                            admission=adm,
                            date=curr_date,
                            status=DayStatus.MISSING,
                            closed=True
                        )
                        curr_date += timedelta(days=1)
                        continue

                    # Decide temp for past days
                    if is_eligible_scenario:
                        temp = Decimal(str(round(random.uniform(36.4, 37.1), 1)))
                    else:
                        temp = Decimal(str(round(random.uniform(36.8, 38.6), 1)))

                    reading_dt = timezone.make_aware(timezone.datetime.combine(curr_date, timezone.datetime.min.time()) + timedelta(hours=8))
                    TemperatureReading.objects.create(
                        admission=adm,
                        recorded_by=nurse,
                        temperature_celsius=temp,
                        date=curr_date,
                        recorded_at=reading_dt,
                        approval_status='APPROVED'
                    )

                    # Doctor visit on past days
                    visit_dt = reading_dt + timedelta(hours=3)
                    DoctorVisit.objects.create(
                        admission=adm,
                        doctor=doctor,
                        date=curr_date,
                        visited_at=visit_dt,
                        treatment_notes=f"Routine checkup for Day {curr_date}. Patient resting comfortably.",
                        is_urgent=False
                    )

                    curr_date += timedelta(days=1)

                # Today's scenario:
                if 1 <= room_num <= 5:
                    # No reading today -> Pending Temperature & Waiting for Doctor visit
                    pass
                elif 6 <= room_num <= 15:
                    # Temp recorded today, NO visit yet -> Ready to visit
                    TemperatureReading.objects.create(
                        admission=adm,
                        recorded_by=nurse,
                        temperature_celsius=Decimal('36.8'),
                        date=today,
                        recorded_at=timezone.now() - timedelta(hours=3),
                        approval_status='APPROVED'
                    )
                elif 16 <= room_num <= 25:
                    # Temp recorded today AND visited today
                    TemperatureReading.objects.create(
                        admission=adm,
                        recorded_by=nurse,
                        temperature_celsius=Decimal('36.7'),
                        date=today,
                        recorded_at=timezone.now() - timedelta(hours=4),
                        approval_status='APPROVED'
                    )
                    DoctorVisit.objects.create(
                        admission=adm,
                        doctor=doctor,
                        date=today,
                        visited_at=timezone.now() - timedelta(hours=1),
                        treatment_notes="Vitals stable, continuing hydration and observation protocol.",
                        is_urgent=False
                    )
                elif 26 <= room_num <= 31:
                    # Eligible for discharge, temp recorded today (fever free)
                    TemperatureReading.objects.create(
                        admission=adm,
                        recorded_by=nurse,
                        temperature_celsius=Decimal('36.6'),
                        date=today,
                        recorded_at=timezone.now() - timedelta(hours=2),
                        approval_status='APPROVED'
                    )
                elif 32 <= room_num <= 36:
                    # Approved for discharge, temp recorded today (fever free)
                    TemperatureReading.objects.create(
                        admission=adm,
                        recorded_by=nurse,
                        temperature_celsius=Decimal('36.5'),
                        date=today,
                        recorded_at=timezone.now() - timedelta(hours=5),
                        approval_status='APPROVED'
                    )
                else:
                    # Other active rooms
                    if room_num % 2 == 0:
                        TemperatureReading.objects.create(
                            admission=adm,
                            recorded_by=nurse,
                            temperature_celsius=Decimal(str(round(random.uniform(36.7, 38.2), 1))),
                            date=today,
                            recorded_at=timezone.now() - timedelta(hours=1),
                            approval_status='APPROVED'
                        )

            # 7. Add 3 Waiting List Patients
            for i in range(1, 4):
                p = Patient.objects.create(
                    name=make_name(i + 300),
                    age=random.randint(30, 60),
                    sex=random.choice(['MALE', 'FEMALE']),
                    contact=f"+1-555-77{i:02d}",
                    emergency_contact=f"+1-555-88{i:02d}"
                )
                WaitingListEntry.objects.create(
                    patient=p,
                    notes=f"Waiting for available room. Triage priority {i}."
                )

            # 8. Check and trigger Critical Alert
            check_mortality_alert()

            # 9. Initial Audit Log
            log_audit(
                'System',
                'SYSTEM_SEEDED',
                'Database',
                reason="Initial seed executed successfully with 74 rooms, 55 active patients, 15 closed cases, and demo users."
            )

        self.stdout.write(self.style.SUCCESS("Database successfully seeded!"))
        self.stdout.write(self.style.SUCCESS("Demo credentials: nurse1/pass123, doctor1/pass123, doctor_head/pass123, admin1/pass123, manager1/pass123"))

