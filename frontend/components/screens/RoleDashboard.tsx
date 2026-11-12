'use client';

import React from 'react';
import { DashboardSummary, User } from '@/types';
import { TabKey } from '@/components/NavigationTabs';
import {
  Thermometer,
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  Clock,
  ArrowRight,
  HeartCrack,
  Award,
  UserPlus
} from 'lucide-react';

interface RoleDashboardProps {
  summary: DashboardSummary | null;
  user: User;
  onNavigate: (tab: TabKey, filter?: string) => void;
}

export default function RoleDashboard({ summary, user, onNavigate }: RoleDashboardProps) {
  if (!summary) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        Loading dashboard metrics...
      </div>
    );
  }

  const { counts = {}, occupancy, mortality } = summary;

  // Occupancy color logic: amber at 90% (>=67/74), red at 100% (74/74)
  const occRate = occupancy.rate;
  const occBadgeColor =
    occRate >= 100
      ? 'bg-red-900/60 text-red-200 border-red-700'
      : occRate >= 90
      ? 'bg-amber-900/60 text-amber-200 border-amber-700'
      : 'bg-emerald-900/60 text-emerald-200 border-emerald-700';

  return (
    <div className="space-y-6">
      {/* Welcome & Facility Snapshot Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Welcome, {user.first_name || user.username}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Role: <span className="text-blue-400 font-semibold">{user.role}</span>
              {user.is_head_doctor && ' • Facility Head Doctor'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Occupancy Counter */}
            <div
              onClick={() => onNavigate('occupancy')}
              className={`cursor-pointer px-4 py-2 rounded-lg border flex items-center space-x-3 transition hover:opacity-90 ${occBadgeColor}`}
            >
              <Building2 className="h-5 w-5" />
              <div>
                <div className="text-xs uppercase font-bold tracking-wider">Facility Occupancy</div>
                <div className="text-base font-extrabold">
                  {occupancy.occupied} / {occupancy.total} Rooms ({occRate}%)
                </div>
              </div>
            </div>

            {/* Mortality Rate Badge */}
            {(user.role === 'DOCTOR' || user.role === 'MANAGER') && (
              <div
                onClick={() => onNavigate('reports')}
                className={`cursor-pointer px-4 py-2 rounded-lg border flex items-center space-x-3 transition hover:opacity-90 ${
                  mortality.is_alert_active
                    ? 'bg-red-950 text-red-200 border-red-800'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                <HeartCrack className={`h-5 w-5 ${mortality.is_alert_active ? 'text-red-400' : 'text-slate-400'}`} />
                <div>
                  <div className="text-xs uppercase font-bold tracking-wider">Mortality Rate</div>
                  <div className="text-base font-extrabold flex items-center space-x-1.5">
                    <span>{mortality.mortality_rate}%</span>
                    <span className="text-xs font-normal text-slate-400">(Benchmark: 15%)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Role-Specific Worklist Cards */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Your Priority Action Items
        </h3>

        {/* 1. NURSE DASHBOARD */}
        {user.role === 'NURSE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() => onNavigate('temperatures', 'pending')}
              className="bg-slate-900 border border-slate-800 hover:border-amber-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Pending Temperature Today</span>
                <div className="p-2 bg-amber-950 text-amber-400 rounded-lg">
                  <Thermometer className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.pending_temperature || 0}</span>
                <span className="text-xs text-amber-400 flex items-center group-hover:translate-x-1 transition">
                  Record now <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Patients awaiting today&apos;s single official temperature reading.
              </p>
            </div>

            <div
              onClick={() => onNavigate('temperatures', 'done')}
              className="bg-slate-900 border border-slate-800 hover:border-blue-500 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Readings Completed Today</span>
                <div className="p-2 bg-blue-950 text-blue-400 rounded-lg">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.done_temperature || 0}</span>
                <span className="text-xs text-blue-400 flex items-center group-hover:translate-x-1 transition">
                  View recorded <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Official readings successfully logged for today.
              </p>
            </div>

            <div
              onClick={() => onNavigate('temperatures', 'missing')}
              className="bg-slate-900 border border-slate-800 hover:border-red-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Historical Missing Readings</span>
                <div className="p-2 bg-red-950 text-red-400 rounded-lg">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.missing_readings || 0}</span>
                <span className="text-xs text-red-400 flex items-center group-hover:translate-x-1 transition">
                  Inspect history <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Days closed with no temperature logged (streak broken).
              </p>
            </div>
          </div>
        )}

        {/* 2. DOCTOR DASHBOARD */}
        {user.role === 'DOCTOR' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() => onNavigate('visits', 'ready')}
              className="bg-slate-900 border border-slate-800 hover:border-emerald-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Ready to Visit</span>
                <div className="p-2 bg-emerald-950 text-emerald-400 rounded-lg">
                  <Stethoscope className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.ready_to_visit || 0}</span>
                <span className="text-xs text-emerald-400 flex items-center group-hover:translate-x-1 transition">
                  Begin rounds <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Temperature recorded today. Unlocked and ready for doctor clinical visit.
              </p>
            </div>

            <div
              onClick={() => onNavigate('visits', 'waiting')}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 shadow-sm cursor-pointer transition opacity-80 hover:opacity-100 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Waiting for Temperature</span>
                <div className="p-2 bg-slate-800 text-slate-400 rounded-lg">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-slate-300">{counts.waiting_for_temperature || 0}</span>
                <span className="text-xs text-slate-400 flex items-center group-hover:translate-x-1 transition">
                  Locked <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Routine visits blocked until nurse records daily temperature reading.
              </p>
            </div>

            <div
              onClick={() => onNavigate('discharges')}
              className="bg-slate-900 border border-slate-800 hover:border-blue-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Eligible for Discharge</span>
                <div className="p-2 bg-blue-950 text-blue-400 rounded-lg">
                  <Award className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.eligible_for_discharge || 0}</span>
                <span className="text-xs text-blue-400 flex items-center group-hover:translate-x-1 transition">
                  Review & Approve <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Patients with 3+ consecutive fever-free days awaiting clinical sign-off.
              </p>
            </div>
          </div>
        )}

        {/* 3. ADMIN DASHBOARD */}
        {user.role === 'ADMIN' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() => onNavigate('discharges')}
              className="bg-slate-900 border border-slate-800 hover:border-emerald-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Approved for Discharge</span>
                <div className="p-2 bg-emerald-950 text-emerald-400 rounded-lg">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.approved_for_discharge || 0}</span>
                <span className="text-xs text-emerald-400 flex items-center group-hover:translate-x-1 transition">
                  Complete & Free Room <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Doctor has signed off. Ready for Admin to complete discharge and free the room.
              </p>
            </div>

            <div
              onClick={() => onNavigate('register')}
              className="bg-slate-900 border border-slate-800 hover:border-blue-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Vacant Rooms Available</span>
                <div className="p-2 bg-blue-950 text-blue-400 rounded-lg">
                  <UserPlus className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.vacant_rooms || 0}</span>
                <span className="text-xs text-blue-400 flex items-center group-hover:translate-x-1 transition">
                  Register Patient <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Vacant rooms ready for new admissions.
              </p>
            </div>

            <div
              onClick={() => onNavigate('occupancy')}
              className="bg-slate-900 border border-slate-800 hover:border-amber-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Waiting List</span>
                <div className="p-2 bg-amber-950 text-amber-400 rounded-lg">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.waiting_list || 0}</span>
                <span className="text-xs text-amber-400 flex items-center group-hover:translate-x-1 transition">
                  View Queue <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Patients queued for assignment when a room becomes vacant.
              </p>
            </div>
          </div>
        )}

        {/* 4. MANAGER DASHBOARD */}
        {user.role === 'MANAGER' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() => onNavigate('reports')}
              className="bg-slate-900 border border-slate-800 hover:border-blue-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Total Closed Cases</span>
                <div className="p-2 bg-blue-950 text-blue-400 rounded-lg">
                  <Award className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">{counts.closed_cases || 0}</span>
                <span className="text-xs text-blue-400 flex items-center group-hover:translate-x-1 transition">
                  Inspect statistics <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Discharged cured ({mortality.discharged_count}) + Deceased ({mortality.deceased_count}).
              </p>
            </div>

            <div
              onClick={() => onNavigate('reports')}
              className="bg-slate-900 border border-slate-800 hover:border-amber-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Compliance & Gaps</span>
                <div className="p-2 bg-amber-950 text-amber-400 rounded-lg">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">
                  {(counts.missing_readings || 0) + (counts.missed_visits || 0)}
                </span>
                <span className="text-xs text-amber-400 flex items-center group-hover:translate-x-1 transition">
                  View report <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {counts.missing_readings || 0} missing readings, {counts.missed_visits || 0} missed visits.
              </p>
            </div>

            <div
              onClick={() => onNavigate('audit')}
              className="bg-slate-900 border border-slate-800 hover:border-purple-600 rounded-xl p-5 shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Security & Audit Log</span>
                <div className="p-2 bg-purple-950 text-purple-400 rounded-lg">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">Immutable</span>
                <span className="text-xs text-purple-400 flex items-center group-hover:translate-x-1 transition">
                  Audit trail <ArrowRight className="h-3 w-3 ml-1" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Append-only ledger of all clinical, access, and configuration events.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

