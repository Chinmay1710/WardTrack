# Aura Virus Treatment & Quarantine Facility App

A full-stack quarantine and clinical management platform engineered for a 74-room viral treatment centre. Designed to eliminate operational bottlenecks, prevent duplicate or missed daily vital signs, enforce clinical visitation sequencing, streamline patient discharges, and monitor facility mortality against the 15% epidemiological benchmark.

---

## Architecture & Stack

- **Backend**: Python 3.11 + Django 5.1 + Django REST Framework + SimpleJWT
  - PostgreSQL via `DATABASE_URL` (SQLite fallback for local execution)
  - Role-based server-side security (deny-by-default, 403 on unauthorized access)
  - Append-only immutable audit logging table
- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
  - Tablet-optimized responsive UI with a navy & blue aesthetic
  - Dynamic role dashboards with actionable worklist links
  - Interactive 74-room graphical layout with amber (90%) and red (100%) occupancy indicators
- **Structure**:
  - `/backend` - Django REST API, models, services, migrations, unit tests, and commands (`seed`, `close_day`)
  - `/frontend` - Next.js 15 application, components, and API client

---

## User Roles & Server-Side Security Model

1. **Nurse (`NURSE`)**:
   - Records single official daily temperature reading per active patient.
   - Plausible range verification (34.0°C – 42.0°C) with mandatory confirmation prompt for outliers.
   - May amend own entry on the same day with a mandatory reason; older entries require doctor approval.
   - Read-only access to doctor visit notes, clinical history, and occupancy.
2. **Doctor (`DOCTOR`)**:
   - Conducts daily clinical visits (blocked until today's temperature is recorded; emergency override available with mandatory justification).
   - Records additional clinical readings with a specified reason.
   - Approves or defers discharges for patients reaching 3+ fever-free days.
   - Records patient deaths (frees room, recalculates mortality rate).
   - Head Doctor flag (`is_head_doctor`): Authorized to configure or modify the facility fever threshold.
3. **Admin Staff (`ADMIN`)**:
   - Registers new patients and atomically assigns vacant rooms or triage waiting list entries.
   - Transfers patients between rooms with atomic row locking (`select_for_update`).
   - Marks rooms out of service for maintenance.
   - Completes doctor-approved discharges (frees rooms).
   - **Privacy Boundary**: Cannot view temperature values or doctor treatment notes (only views fever-free streak counts).
4. **Hospital Manager (`MANAGER`)**:
   - System-wide executive dashboard, epidemiological reports, and CSV metric export.
   - Reviews and acknowledges active Critical Mortality Alerts with mandatory remarks.
   - Read-only access to clinical data; manages user accounts and inspects append-only audit logs.

---

## Local Setup & Run Guide

### 1. Prerequisites
- Python 3.10+ (Python 3.11 recommended)
- Node.js 18+ & npm

### 2. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
python manage.py migrate

# Seed 74 rooms, demo accounts, and ~60 patient scenarios
python manage.py seed

# Run unit tests
python manage.py test facility

# Start Django development server (default port 8000, or 8005 if port 8000 is occupied)
python manage.py runserver 0.0.0.0:8000
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Build production bundle
npm run build

# Start Next.js server (runs on port 3000 by default, or 3001)
npm run start
# Or start in dev mode:
npm run dev
```

> **Note on Environment Ports**:
> If running backend on port 8005 locally, ensure `frontend/.env.local` contains:
> `NEXT_PUBLIC_API_URL=http://localhost:8005/api`

---

## Seed Accounts

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Nurse** | `nurse1` | `pass123` | Shift nurse; records daily temperatures |
| **Doctor** | `doctor1` | `pass123` | Attending physician; visits, approves discharges |
| **Head Doctor** | `doctor_head`| `pass123` | Flagged `is_head_doctor`; can modify fever threshold |
| **Admin Staff** | `admin1` | `pass123` | Patient admissions, room assignments, discharges |
| **Manager** | `manager1` | `pass123` | Dashboard, audit logs, critical alert acknowledgement |

The login page features **1-Click Quick Demo Buttons** for instant role switching during evaluations.

---

## Step-by-Step Demo Script

Follow this sequence to test all core business rules and workflows:

### Step 1: Nurse Records Temperature & Triggers Duplicate Guard
1. Log in as `nurse1` (`pass123`) or click **Nurse** on the login screen.
2. From the dashboard, click **Pending Temperature Today** or navigate to **Temperature Worklist**.
3. Select an active patient in **Pending Today** (e.g. Room 1). Click **Record Temp**.
4. Enter `36.8` and save. Notice the patient moves to **Completed Today**.
5. Attempt to record an official temperature for the same patient again today.
6. **Observed Result**: Blocked with server-generated error message:
   `"Temperature already recorded today at HH:MM by nurse1."`

### Step 2: Doctor Sees Locked Patient, Then Conducts Visit
1. Switch to `doctor1` (`pass123`) via top navbar quick switch.
2. Navigate to **Doctor Visits**.
3. Click the **Waiting for Temperature (Locked)** tab. Select a locked patient with no temperature today.
4. Attempt to submit routine visit notes.
5. **Observed Result**: Blocked with message:
   `"Temperature not recorded yet for this patient."`
6. Now select a patient in **Ready to Visit** (e.g. Room 6).
7. Enter treatment notes (e.g. *"Vitals stable, clear breath sounds"*) and click **Save Visit Notes**.
8. Notice patient moves to **Visited Today**.

### Step 3: Doctor Approves Discharge for Eligible Patient
1. Still logged in as `doctor1`, navigate to **Discharge Management**.
2. Under **Eligible for Discharge (≥ 3 Fever-Free Days)**, find an eligible patient (e.g. Room 26, 3 fever-free days).
3. Click **Approve Discharge**.
4. Notice the patient moves to the **Approved for Discharge** section.

### Step 4: Admin Completes Discharge and Admits New Patient
1. Switch to `admin1` (`pass123`) via top navbar.
2. Navigate to **Discharge Management**.
3. Locate the approved patient from Step 3 and click **Complete Discharge & Free Room**.
4. Patient is marked `Discharged` and their room is freed.
5. Navigate to **Patient Registration**.
6. Register a new patient (*e.g. "Robert Taylor", 48, Male, Contact "555-0199"*). Select the newly freed room.
7. Click **Register and Admit Patient**. Notice successful room occupancy.

### Step 5: Manager Reviews Dashboard, Audit Log, and Acknowledges Alert
1. Switch to `manager1` (`pass123`).
2. Notice the red **CRITICAL ALERT** banner indicating mortality exceeds 15% benchmark (3 deaths out of 15 closed cases = 20.00%).
3. Click **Acknowledge Alert**, enter review remarks (*e.g. "Infectious disease review conducted"*), and submit.
4. Navigate to **Reports & Mortality** to review:
   - 20.00% Mortality vs 15.0% Benchmark line
   - 80.00% Survival vs 85.0% Target line
   - 30-Day Rolling rate and compliance statistics
   - Click **Export Metrics CSV** to download report.
5. Navigate to **Audit Log** to inspect the immutable chronological audit records for logins, clinical entries, discharges, and alert acknowledgements.

---

## Production Deployment Guide

### Environment Variables Reference

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/dbname` |
| `SECRET_KEY` | Django cryptographic signing key | `django-insecure-production-secret-xyz` |
| `DEBUG` | Enable/disable debug mode | `False` |
| `ALLOWED_HOSTS` | Comma-separated allowed hostnames | `api.aura-facility.com,backend.up.railway.app` |
| `CORS_ALLOWED_ORIGINS`| Comma-separated frontend origins | `https://aura-facility.vercel.app` |
| `NEXT_PUBLIC_API_URL` | Backend API URL for frontend | `https://api.aura-facility.com/api` |

---

### Backend Deployment (Render or Railway)

#### Deploying on Render:
1. Connect repository to Render as a **Web Service**.
2. Set Root Directory to `backend`.
3. Set Environment to `Python`.
4. Build Command:
   ```bash
   pip install -r requirements.txt && python manage.py migrate && python manage.py seed
   ```
5. Start Command:
   ```bash
   gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
   ```
6. Add a **PostgreSQL** database instance and link `DATABASE_URL`.
7. Configure `ALLOWED_HOSTS`, `SECRET_KEY`, and `CORS_ALLOWED_ORIGINS`.

#### Daily Cron Job on Render / Railway:
Add a scheduled background job executing daily:
```bash
python manage.py close_day
```

---

### Frontend Deployment (Vercel)

1. Import repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Framework Preset: **Next.js**.
4. Configure Environment Variable:
   - `NEXT_PUBLIC_API_URL` = `https://<your-backend-domain>/api`
5. Deploy.

---

## Automated Verification & Test Results

The backend contains a dedicated test suite (`facility.tests.FacilityBusinessRulesTests`) verifying core business rules:

```bash
cd backend
python manage.py test facility
```

### Verified Test Cases:
1. `test_duplicate_temperature_reading_blocked`:
   - Verifies database unique constraint `(admission, date)` for official readings.
   - Asserts exact error return: `"Temperature already recorded today at HH:MM by <nurse>."`
2. `test_streak_calculation_scenarios`:
   - Scenario **N N N**: 3 fever-free days -> streak = 3 (Eligible).
   - Scenario **N M N N**: Streak stops at missing day `M` -> streak = 1.
   - Scenario **N N F N N**: Streak stops at fever day `F` -> streak = 2.
   - Scenario **F N N N**: 3 fever-free days preceded by fever -> streak = 3 (Eligible).
3. `test_doctor_visit_blocked_without_temperature`:
   - Verifies blocking routine visits before temperature is recorded: `"Temperature not recorded yet for this patient."`
   - Verifies urgent override requires mandatory justification.
4. `test_discharge_permissions_and_workflow`:
   - Verifies Nurse is forbidden from approving discharge (HTTP 403).
   - Verifies Admin cannot complete discharge before doctor approval (`"Awaiting doctor approval."`).
   - Verifies that if a fever reading arrives after doctor approval, approval is automatically cancelled before completion (`"Approval cancelled: patient developed fever."`).
5. `test_mortality_alert_boundary`:
   - **3 of 20** closed cases = 15.0% -> Alert is NOT triggered.
   - **4 of 20** closed cases = 20.0% -> Critical alert IS triggered immediately.

**All 5 test suites pass with 100% success.**

