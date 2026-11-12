'use client';

import React, { useState, useEffect } from 'react';
import { Admission, User } from '@/types';
import { apiRequest } from '@/lib/api';
import {
  Award,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  X,
  FileCheck2,
  ShieldCheck
} from 'lucide-react';

interface DischargeScreenProps {
  user: User;
  onDischargeCompleted?: () => void;
}

export default function DischargeScreen({ user, onDischargeCompleted }: DischargeScreenProps) {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Defer modal
  const [deferringAdmission, setDeferringAdmission] = useState<Admission | null>(null);
  const [deferReason, setDeferReason] = useState('');
  const [deferSubmitting, setDeferSubmitting] = useState(false);

  const fetchAdmissions = async () => {
    setLoading(true);
    try {
      const data: Admission[] = await apiRequest('/admissions/?status=ACTIVE');
      setAdmissions(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmissions();
  }, []);

  // Groups:
  // 1. Eligible for discharge (fever-free streak >= 3, discharge_status is ELIGIBLE or PENDING with streak>=3)
  const eligiblePatients = admissions.filter(
    (a) => a.discharge_status === 'ELIGIBLE' || (a.streak_info.streak_count >= 3 && a.discharge_status === 'PENDING')
  );

  // 2. Approved for discharge (Doctor approved, ready for Admin completion)
  const approvedPatients = admissions.filter((a) => a.discharge_status === 'APPROVED');

  // 3. Deferred patients
  const deferredPatients = admissions.filter((a) => a.discharge_status === 'DEFERRED');

  const handleApprove = async (adm: Admission) => {
    setActionError('');
    setActionSuccess('');
    try {
      await apiRequest(`/admissions/${adm.id}/approve_discharge/`, {
        method: 'POST',
      });
      setActionSuccess(`Discharge approved for ${adm.patient.name}. Ready for Admin to complete.`);
      fetchAdmissions();
    } catch (err: any) {
      setActionError(err.message || 'Failed to approve discharge.');
    }
  };

  const handleDeferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deferringAdmission || !deferReason.trim()) return;

    setDeferSubmitting(true);
    setActionError('');
    setActionSuccess('');

    try {
      await apiRequest(`/admissions/${deferringAdmission.id}/defer_discharge/`, {
        method: 'POST',
        body: JSON.stringify({ reason: deferReason.trim() }),
      });
      setDeferringAdmission(null);
      setDeferReason('');
      setActionSuccess('Discharge deferred with recorded reason.');
      fetchAdmissions();
    } catch (err: any) {
      setActionError(err.message || 'Failed to defer discharge.');
    } finally {
      setDeferSubmitting(false);
    }
  };

  const handleCompleteDischarge = async (adm: Admission) => {
    setActionError('');
    setActionSuccess('');
    try {
      const res = await apiRequest(`/admissions/${adm.id}/complete_discharge/`, {
        method: 'POST',
      });
      setActionSuccess(res.detail || `Discharge completed for ${adm.patient.name}. Room freed!`);
      fetchAdmissions();
      if (onDischargeCompleted) onDischargeCompleted();
    } catch (err: any) {
      setActionError(err.message || 'Failed to complete discharge.');
      fetchAdmissions();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-3 bg-blue-600 rounded-lg text-white">
            <FileCheck2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Discharge Management Hub</h2>
            <p className="text-xs text-slate-400">
              Protocol: Patient cured after 3 consecutive full fever-free days. Doctor approves or defers; Admin completes discharge and frees room.
            </p>
          </div>
        </div>

        {actionSuccess && (
          <div className="mt-4 bg-emerald-950/80 border border-emerald-800 text-emerald-200 p-3 rounded-lg text-xs flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <div>{actionSuccess}</div>
          </div>
        )}

        {actionError && (
          <div className="mt-4 bg-red-950/80 border border-red-800 text-red-200 p-3 rounded-lg text-xs flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <div>{actionError}</div>
          </div>
        )}
      </div>

      {/* SECTION 1: Approved for Discharge (Admin Action) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              Approved for Discharge (Awaiting Admin Completion)
            </h3>
            <span className="bg-emerald-950 text-emerald-300 text-xs px-2 py-0.5 rounded-full font-semibold border border-emerald-800">
              {approvedPatients.length}
            </span>
          </div>
          <span className="text-xs text-slate-400">Role: Admin Staff completes</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading approved patients...</div>
        ) : approvedPatients.length === 0 ? (
          <div className="bg-slate-950 p-6 rounded-lg text-center text-slate-400 text-xs border border-slate-800">
            No patients currently approved for discharge.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {approvedPatients.map((adm) => (
              <div
                key={adm.id}
                className="bg-slate-950 border border-emerald-850 p-4 rounded-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-white text-base">{adm.patient.name}</span>
                    <span className="px-2.5 py-1 bg-slate-900 text-xs font-bold text-slate-300 rounded border border-slate-750">
                      Room {adm.room_number || 'N/A'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1 mb-4">
                    <p>Age {adm.patient.age} • {adm.patient.sex} • Contact: {adm.patient.contact || 'None'}</p>
                    <p className="text-emerald-400 font-semibold">
                      ✓ Clinical approval granted by Doctor
                    </p>
                    <p className="text-slate-400 text-[11px]">
                      Consecutive Fever-Free Days: {adm.streak_info.streak_count}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end">
                  {user.role === 'ADMIN' ? (
                    <button
                      onClick={() => handleCompleteDischarge(adm)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow flex items-center space-x-1.5 transition"
                    >
                      <Check className="h-4 w-4" />
                      <span>Complete Discharge & Free Room</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="px-3.5 py-2 bg-slate-800 text-slate-400 rounded-lg text-xs cursor-not-allowed border border-slate-700"
                    >
                      Admin Staff Only (Complete Discharge)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: Eligible for Discharge (Doctor Action) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Award className="h-5 w-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">
              Eligible for Discharge (≥ 3 Fever-Free Days)
            </h3>
            <span className="bg-blue-950 text-blue-300 text-xs px-2 py-0.5 rounded-full font-semibold border border-blue-800">
              {eligiblePatients.length}
            </span>
          </div>
          <span className="text-xs text-slate-400">Role: Doctor reviews & approves</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading eligible patients...</div>
        ) : eligiblePatients.length === 0 ? (
          <div className="bg-slate-950 p-6 rounded-lg text-center text-slate-400 text-xs border border-slate-800">
            No patients currently meet the 3 fever-free days eligibility benchmark.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eligiblePatients.map((adm) => (
              <div
                key={adm.id}
                className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-white text-base">{adm.patient.name}</span>
                    <span className="px-2.5 py-1 bg-slate-900 text-xs font-bold text-slate-300 rounded border border-slate-750">
                      Room {adm.room_number || 'N/A'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1 mb-4">
                    <p>Age {adm.patient.age} • {adm.patient.sex}</p>
                    <p className="text-emerald-400 font-bold text-sm">
                      {adm.streak_info.streak_count} Fever-Free Days Achieved
                    </p>
                    {adm.streak_info.extra_days_stayed > 0 && (
                      <p className="text-amber-400 text-xs">
                        Stayed {adm.streak_info.extra_days_stayed} extra days past eligibility
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                  {user.role === 'DOCTOR' ? (
                    <>
                      <button
                        onClick={() => {
                          setDeferringAdmission(adm);
                          setDeferReason('');
                        }}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-semibold"
                      >
                        Defer Discharge
                      </button>
                      <button
                        onClick={() => handleApprove(adm)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow flex items-center space-x-1.5 transition"
                      >
                        <Check className="h-4 w-4" />
                        <span>Approve Discharge</span>
                      </button>
                    </>
                  ) : (
                    <button
                      disabled
                      className="px-3.5 py-2 bg-slate-800/60 text-slate-500 rounded-lg text-xs cursor-not-allowed border border-slate-800 font-medium"
                      title="Button disabled: Awaiting doctor approval"
                    >
                      Awaiting doctor approval
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: Deferred Discharges List */}
      {deferredPatients.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-amber-300 uppercase mb-3 flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>Deferred Discharges ({deferredPatients.length})</span>
          </h3>
          <div className="space-y-2">
            {deferredPatients.map((adm) => (
              <div
                key={adm.id}
                className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-white mr-2">{adm.patient.name}</span>
                  <span className="text-slate-400 mr-3">Room {adm.room_number}</span>
                  <span className="text-amber-400 italic">
                    Reason: {adm.discharge_deferred_reason || 'Under clinical review'}
                  </span>
                </div>

                {user.role === 'DOCTOR' && (
                  <button
                    onClick={() => handleApprove(adm)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold"
                  >
                    Re-Approve
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Defer Reason Modal */}
      {deferringAdmission && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-5 text-white shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Defer Patient Discharge</h3>
            <p className="text-xs text-slate-400 mb-3">
              Patient: {deferringAdmission.patient.name} (Room {deferringAdmission.room_number}). A mandatory clinical reason is required to defer discharge.
            </p>

            <form onSubmit={handleDeferSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Reason for Deferral <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={deferReason}
                  onChange={(e) => setDeferReason(e.target.value)}
                  placeholder="e.g. Mild persistent fatigue; scheduled for secondary viral panel."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeferringAdmission(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deferSubmitting}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-xs disabled:opacity-50"
                >
                  {deferSubmitting ? 'Deferring...' : 'Confirm Deferral'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

