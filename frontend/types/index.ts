export type UserRole = 'NURSE' | 'DOCTOR' | 'ADMIN' | 'MANAGER';

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  is_head_doctor: boolean;
  is_active: boolean;
}

export type RoomStatus = 'VACANT' | 'OCCUPIED' | 'OUT_OF_SERVICE';

export interface Room {
  id: number;
  number: number;
  status: RoomStatus;
  notes: string;
  active_admission?: {
    admission_id: number;
    patient_id: number;
    patient_name: string;
    admitted_at: string;
    discharge_status: string;
  } | null;
}

export interface Patient {
  id: number;
  name: string;
  age: number;
  sex: 'MALE' | 'FEMALE' | 'OTHER';
  contact: string;
  emergency_contact: string;
  created_at: string;
}

export type AdmissionStatus = 'ACTIVE' | 'DISCHARGED' | 'DECEASED';
export type DischargeStatus = 'PENDING' | 'ELIGIBLE' | 'APPROVED' | 'DEFERRED';

export interface DayStatusHistory {
  date: string;
  status: 'FEVER' | 'FEVER_FREE' | 'MISSING';
}

export interface StreakInfo {
  streak_count: number;
  extra_days_stayed: number;
  is_eligible: boolean;
  is_threshold_configured: boolean;
  day_history: DayStatusHistory[];
}

export interface TodayStatus {
  has_temperature_today: boolean;
  has_visit_today: boolean;
  ready_for_visit: boolean;
  waiting_for_temperature: boolean;
  visited_today: boolean;
}

export interface TemperatureReading {
  id: number;
  admission: number;
  temperature_celsius?: string | number;
  date: string;
  recorded_at: string;
  recorded_by: number;
  recorded_by_name: string;
  is_additional: boolean;
  additional_reason: string;
  amendment_reason: string;
  approval_status: 'APPROVED' | 'PENDING_APPROVAL';
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
}

export interface VisitAddendum {
  id: number;
  visit: number;
  doctor: number;
  doctor_name: string;
  note: string;
  created_at: string;
}

export interface DoctorVisit {
  id: number;
  admission: number;
  doctor: number;
  doctor_name: string;
  date: string;
  visited_at: string;
  treatment_notes?: string;
  is_urgent: boolean;
  urgent_reason?: string;
  is_followup: boolean;
  is_missed: boolean;
  addenda?: VisitAddendum[];
}

export interface Admission {
  id: number;
  patient: Patient;
  room?: number | null;
  room_number?: number | null;
  admitted_at: string;
  discharged_at?: string | null;
  status: AdmissionStatus;
  discharge_status: DischargeStatus;
  discharge_approved_by?: number | null;
  discharge_approved_at?: string | null;
  discharge_deferred_reason?: string;
  discharge_completed_by?: number | null;
  death_recorded_by?: number | null;
  death_recorded_at?: string | null;
  death_notes?: string;
  temperature_readings?: TemperatureReading[];
  doctor_visits?: DoctorVisit[];
  streak_info: StreakInfo;
  today_status: TodayStatus;
}

export interface WaitingListEntry {
  id: number;
  patient: number;
  patient_name: string;
  patient_age: number;
  patient_sex: string;
  notes: string;
  created_at: string;
  is_admitted: boolean;
}

export interface CriticalAlert {
  id: number;
  alert_type: string;
  mortality_rate: string | number;
  benchmark_rate: string | number;
  deaths_count: number;
  closed_cases_count: number;
  is_active: boolean;
  raised_at: string;
  cleared_at?: string | null;
  acknowledged_by?: number | null;
  acknowledged_by_name?: string | null;
  acknowledged_at?: string | null;
  acknowledgement_comment?: string;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  user?: number | null;
  username: string;
  role: string;
  action: string;
  entity: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
  reason?: string;
}

export interface DashboardSummary {
  role: UserRole;
  total_active_patients: number;
  occupancy: {
    occupied: number;
    total: number;
    vacant: number;
    out_of_service: number;
    rate: number;
  };
  mortality: {
    closed_cases: number;
    discharged_count: number;
    deceased_count: number;
    mortality_rate: number;
    survival_rate: number;
    is_alert_active: boolean;
    active_alert?: CriticalAlert | null;
  };
  fever_threshold: {
    is_configured: boolean;
    is_confirmed_by_head: boolean;
    banner: string;
  };
  counts?: Record<string, number>;
}
