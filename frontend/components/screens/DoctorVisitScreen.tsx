'use client';

import React, { useState, useEffect } from 'react';
import { Admission, DoctorVisit, User } from '@/types';
import { apiRequest } from '@/lib/api';
import {
  Stethoscope,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  PlusCircle,
  FileText,
  UserCheck,
  X,
  Skull,
  Award
} from 'lucide-react';

interface DoctorVisitScreenProps {
  initialGroup?: string;
  user: User;
  onVisitLogged?: () => void;
}

export default function DoctorVisitScreen({
  initialGroup = 'ready',
  user,
  onVisitLogged,
}: DoctorVisitScreenProps) {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<'ready' | 'waiting' | 'visited' | 'all'>(
    (initialGroup as any) || 'ready'
  );
  const [searchTerm, setSearchTerm] = useState('');

  // Active selected admission for clinical review & visit logging
  const [selectedAdmission, setSelectedAdmission] = useState<Admission | null>(null);

  // Visit Form state
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [urgentReason, setUrgentReason] = useState('');
  const [isFollowup, setIsFollowup] = useState(false);
  const [submittingVisit, setSubmittingVisit] = useState(false);
  const [visitError, setVisitError] = useState('');
  const [visitSuccess, setVisitSuccess] = useState('');

  // Addendum state
  const [addingAddendumVisitId, setAddingAddendumVisitId] = useState<number | null>(null);
  const [addendumNote, setAddendumNote] = useState('');

  // Death record state
  const [showDeathModal, setShowDeathModal] = useState(false);
  const [deathNotes, setDeathNotes] = useState('');
  const [deathSubmitting, setDeathSubmitting] = useState(false);

  const fetchAdmissions = async () => {
    setLoading(true);
    try {
      const data: Admission[] = await apiRequest('/admissions/?status=ACTIVE');
      setAdmissions(data);
      if (selectedAdmission) {
        const updated = data.find((a) => a.id === selectedAdmission.id);
        if (updated) setSelectedAdmission(updated);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmissions();
  }, []);

  const readyList = admissions.filter((a) => a.today_status.ready_for_visit);
  const waitingList = admissions.filter((a) => a.today_status.waiting_for_temperature);
  const visitedList = admissions.filter((a) => a.today_status.visited_today);

  const currentDisplayList =
    selectedGroup === 'ready'
      ? readyList
      : selectedGroup === 'waiting'
      ? waitingList
      : selectedGroup === 'visited'
      ? visitedList
      : admissions;

  const filteredList = currentDisplayList.filter(
    (a) =>
      a.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(a.room_number || '').includes(searchTerm)
  );

  const handleOpenPatient = (adm: Admission) => {
    setSelectedAdmission(adm);
    setTreatmentNotes('');
    setIsUrgent(false);
    setUrgentReason('');
    setIsFollowup(adm.today_status.visited_today);
    setVisitError('');
    setVisitSuccess('');
  };

  const handleRecordVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmission || !treatmentNotes.trim()) {
      setVisitError('Treatment notes are required.');
      return;
    }

    if (isUrgent && !urgentReason.trim()) {
      setVisitError('Mandatory reason required for urgent visit override.');
      return;
    }

    setSubmittingVisit(true);
    setVisitError('');
    setVisitSuccess('');

    try {
      await apiRequest('/visits/', {
        method: 'POST',
        body: JSON.stringify({
          admission: selectedAdmission.id,
          treatment_notes: treatmentNotes.trim(),
          is_urgent: isUrgent,
          urgent_reason: urgentReason.trim(),
          is_followup: isFollowup,
        }),
      });

      setVisitSuccess('Visit notes recorded successfully.');
      setTreatmentNotes('');
      setIsUrgent(false);
      setUrgentReason('');
      fetchAdmissions();
      if (onVisitLogged) onVisitLogged();
    } catch (err: any) {
      setVisitError(err.message || 'Failed to record visit.');
      if (err.data && err.data.can_followup) {
        setIsFollowup(true);
      }
    } finally {
      setSubmittingVisit(false);
    }
  };

  const handleAddAddendum = async (visitId: number) => {
    if (!addendumNote.trim()) return;
    try {
      await apiRequest(`/visits/${visitId}/addendum/`, {
        method: 'POST',
        body: JSON.stringify({ note: addendumNote.trim() }),
      });
      setAddingAddendumVisitId(null);
      setAddendumNote('');
      fetchAdmissions();
    } catch (err: any) {
      alert(err.message || 'Failed to add addendum.');
    }
  };

  const handleDischargeAction = async (action: 'approve' | 'defer', reason?: string) => {
    if (!selectedAdmission) return;
    try {
      const endpoint =
        action === 'approve'
          ? `/admissions/${selectedAdmission.id}/approve_discharge/`
          : `/admissions/${selectedAdmission.id}/defer_discharge/`;

      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Approved after 3 fever-free days.' }),
      });
      fetchAdmissions();
    } catch (err: any) {
      alert(err.message || 'Action failed.');
    }
  };

  const handleRecordDeath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmission) return;
    setDeathSubmitting(true);
    try {
      await apiRequest(`/admissions/${selectedAdmission.id}/record_death/`, {
        method: 'POST',
        body: JSON.stringify({ notes: deathNotes.trim() }),
      });
      setShowDeathModal(false);
      setSelectedAdmission(null);
      fetchAdmissions();
      if (onVisitLogged) onVisitLogged();
    } catch (err: any) {
      alert(err.message || 'Failed to record death.');
    } finally {
      setDeathSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Group Selectors */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <Stethoscope className="h-6 w-6 text-blue-400" />
              <span>Doctor Clinical Rounds & Visits</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Protocol: Routine visit permitted only after today&apos;s temperature is taken. Urgent override available with mandatory reason.
            </p>
          </div>

          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search patient or room..."
              className="bg-slate-950 border border-slate-700 text-xs rounded-lg pl-9 pr-3.5 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 w-56"
            />
          </div>
        </div>

        {/* Worklist Group Pills */}
        <div className="flex space-x-2 mt-4 pt-4 border-t border-slate-800">
          <button
            onClick={() => setSelectedGroup('ready')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              selectedGroup === 'ready'
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            <span>Ready to Visit</span>
            <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">
              {readyList.length}
            </span>
          </button>

          <button
            onClick={() => setSelectedGroup('waiting')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              selectedGroup === 'waiting'
                ? 'bg-slate-700 text-white shadow'
                : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Lock className="h-4 w-4 text-slate-400" />
            <span>Waiting for Temperature (Locked)</span>
            <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">
              {waitingList.length}
            </span>
          </button>

          <button
            onClick={() => setSelectedGroup('visited')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              selectedGroup === 'visited'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <UserCheck className="h-4 w-4 text-blue-300" />
            <span>Visited Today</span>
            <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">
              {visitedList.length}
            </span>
          </button>
        </div>
      </div>

      {/* Grid of Patient Cards for Rounds */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full p-12 text-center text-slate-400">Loading rounds list...</div>
        ) : filteredList.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-400">
            No patients in this group.
          </div>
        ) : (
          filteredList.map((adm) => {
            const isReady = adm.today_status.ready_for_visit;
            const isWaiting = adm.today_status.waiting_for_temperature;
            const isVisited = adm.today_status.visited_today;
            const latestTemp = adm.temperature_readings?.[0];

            return (
              <div
                key={adm.id}
                onClick={() => handleOpenPatient(adm)}
                className={`rounded-xl border p-5 shadow-sm transition cursor-pointer relative ${
                  isWaiting
                    ? 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    : isReady
                    ? 'bg-slate-900 border-emerald-800/80 hover:border-emerald-500'
                    : 'bg-slate-900 border-slate-800 hover:border-blue-500'
                }`}
              >
                {/* Header: Room & Status Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-white text-base px-2.5 py-1 bg-slate-950 rounded-lg border border-slate-800">
                    Room {adm.room_number || 'N/A'}
                  </span>

                  {isWaiting && (
                    <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
                      <Lock className="h-3 w-3" />
                      <span>Locked (Awaiting Temp)</span>
                    </span>
                  )}
                  {isReady && (
                    <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950 px-2.5 py-1 rounded-full border border-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Ready to Visit</span>
                    </span>
                  )}
                  {isVisited && (
                    <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-blue-300 bg-blue-950 px-2.5 py-1 rounded-full border border-blue-800">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Visited</span>
                    </span>
                  )}
                </div>

                <div className="space-y-1 mb-4">
                  <h4 className="text-base font-bold text-white">{adm.patient.name}</h4>
                  <p className="text-xs text-slate-400">
                    Age {adm.patient.age} • {adm.patient.sex}
                  </p>
                </div>

                {/* Clinical Vitals Snippet */}
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs flex justify-between items-center mb-3">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Today&apos;s Temp</span>
                    <span className="font-bold text-white text-sm">
                      {latestTemp ? `${latestTemp.temperature_celsius}°C` : 'Not recorded'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase">Fever-Free Streak</span>
                    <span className="font-bold text-emerald-400 text-sm">
                      {adm.streak_info.streak_count} Days
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                  <span className="text-slate-400">
                    Admitted: {new Date(adm.admitted_at).toLocaleDateString()}
                  </span>
                  <span className="text-blue-400 font-semibold flex items-center space-x-1">
                    <span>Clinical Profile &raquo;</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Patient Profile & Visit Modal */}
      {selectedAdmission && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full p-6 text-white shadow-2xl max-h-[90vh] flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-600 rounded-lg text-white">
                  <Stethoscope className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {selectedAdmission.patient.name} (Room {selectedAdmission.room_number})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Age {selectedAdmission.patient.age} • {selectedAdmission.patient.sex} • Contact: {selectedAdmission.patient.contact || 'None'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {user.role === 'DOCTOR' && (
                  <button
                    onClick={() => setShowDeathModal(true)}
                    className="px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 rounded-lg text-xs font-semibold flex items-center space-x-1.5"
                  >
                    <Skull className="h-4 w-4" />
                    <span>Record Death</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedAdmission(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Modal Body: Left column History/Chart, Right column Visit Logging Form */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pr-1 flex-1">
              {/* Left Column: Clinical Stats & History (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Fever Free & Discharge Status */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs uppercase font-semibold text-slate-400">
                      Fever-Free Streak
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-semibold">
                      Threshold: 3 Days
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-extrabold text-emerald-400">
                      {selectedAdmission.streak_info.streak_count}
                    </span>
                    <span className="text-sm text-slate-300">consecutive days</span>
                  </div>

                  {selectedAdmission.streak_info.extra_days_stayed > 0 && (
                    <div className="text-xs text-amber-400 mt-1">
                      + {selectedAdmission.streak_info.extra_days_stayed} extra days stayed after becoming eligible
                    </div>
                  )}

                  {/* Doctor Discharge Actions */}
                  {user.role === 'DOCTOR' && selectedAdmission.streak_info.streak_count >= 3 && (
                    <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                      <span className="text-xs font-semibold text-white block">
                        Discharge Sign-off:
                      </span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleDischargeAction('approve')}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition flex items-center justify-center space-x-1"
                        >
                          <Award className="h-3.5 w-3.5" />
                          <span>Approve Discharge</span>
                        </button>
                        <button
                          onClick={() => {
                            const r = prompt('Reason to defer discharge:');
                            if (r) handleDischargeAction('defer', r);
                          }}
                          className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-white rounded text-xs font-semibold transition"
                        >
                          Defer
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Day status history cards */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-3">
                    Recent Day-by-Day Trajectory
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedAdmission.streak_info.day_history.length > 0 ? (
                      selectedAdmission.streak_info.day_history.map((dh, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-slate-900 border border-slate-850"
                        >
                          <span className="text-slate-300">{dh.date}</span>
                          <span
                            className={`font-semibold px-2 py-0.2 rounded text-[11px] ${
                              dh.status === 'FEVER_FREE'
                                ? 'bg-emerald-950 text-emerald-300'
                                : dh.status === 'FEVER'
                                ? 'bg-red-950 text-red-300'
                                : 'bg-amber-950 text-amber-300'
                            }`}
                          >
                            {dh.status === 'FEVER_FREE'
                              ? 'Fever Free'
                              : dh.status === 'FEVER'
                              ? 'Fever'
                              : 'Missing'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">No prior day summaries.</span>
                    )}
                  </div>
                </div>

                {/* Temperature Readings list */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-2">
                    Temperature Readings ({selectedAdmission.temperature_readings?.length || 0})
                  </span>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1 text-xs">
                    {selectedAdmission.temperature_readings && selectedAdmission.temperature_readings.length > 0 ? (
                      selectedAdmission.temperature_readings.map((r) => (
                        <div key={r.id} className="p-2 rounded bg-slate-900 flex justify-between items-center">
                          <div>
                            <span className="font-bold text-white text-sm">{r.temperature_celsius}°C</span>
                            <span className="text-slate-400 block text-[10px]">
                              {r.date} by {r.recorded_by_name}
                            </span>
                          </div>
                          {r.is_additional && (
                            <span className="bg-purple-950 text-purple-300 text-[10px] px-1.5 py-0.5 rounded">
                              Additional
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">No temperature readings.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Visit Log Form & Past Doctor Notes (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Visit Entry Form */}
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800">
                  <h4 className="text-sm font-bold text-white uppercase mb-3 flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-blue-400" />
                    <span>Log Daily Visit & Treatment Notes</span>
                  </h4>

                  {visitSuccess && (
                    <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 p-2.5 rounded-lg text-xs mb-3 flex items-center space-x-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <div>{visitSuccess}</div>
                    </div>
                  )}

                  {visitError && (
                    <div className="bg-red-950/80 border border-red-800 text-red-200 p-2.5 rounded-lg text-xs mb-3 flex items-start space-x-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                      <div>{visitError}</div>
                    </div>
                  )}

                  {/* Warning if no temperature recorded today */}
                  {!selectedAdmission.today_status.has_temperature_today && (
                    <div className="bg-amber-950/70 border border-amber-800 text-amber-200 p-3 rounded-lg text-xs mb-3 space-y-2">
                      <div className="flex items-center space-x-2 font-semibold text-amber-300">
                        <Lock className="h-4 w-4 shrink-0" />
                        <span>Temperature not recorded yet for this patient.</span>
                      </div>
                      <p className="text-[11px] text-amber-200/80">
                        Routine doctor visit is blocked until temperature is recorded. You may invoke the Urgent Override if immediate clinical intervention is required.
                      </p>
                      <label className="flex items-center space-x-2 cursor-pointer mt-1 pt-2 border-t border-amber-900/60">
                        <input
                          type="checkbox"
                          checked={isUrgent}
                          onChange={(e) => setIsUrgent(e.target.checked)}
                          className="rounded bg-slate-900 border-amber-700 text-amber-500 focus:ring-0 h-4 w-4"
                        />
                        <span className="font-bold text-amber-300">
                          Urgent Override (Flagged in Audit Log)
                        </span>
                      </label>
                    </div>
                  )}

                  <form onSubmit={handleRecordVisit} className="space-y-3">
                    {isUrgent && (
                      <div>
                        <label className="block text-xs font-semibold text-amber-400 uppercase mb-1">
                          Mandatory Urgent Override Reason <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={urgentReason}
                          onChange={(e) => setUrgentReason(e.target.value)}
                          placeholder="e.g. Acute dyspnea; emergent stabilization required."
                          className="w-full bg-slate-900 border border-amber-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                        Treatment & Clinical Notes <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        rows={4}
                        value={treatmentNotes}
                        onChange={(e) => setTreatmentNotes(e.target.value)}
                        placeholder="e.g. Patient alert and oriented. Lung fields clear bilaterally. Vitals stable under observation protocol."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {selectedAdmission.today_status.visited_today && (
                        <label className="flex items-center space-x-2 text-xs text-blue-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isFollowup}
                            onChange={(e) => setIsFollowup(e.target.checked)}
                            className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0 h-4 w-4"
                          />
                          <span>Logging as Follow-up Note</span>
                        </label>
                      )}

                      <div className="ml-auto">
                        <button
                          type="submit"
                          disabled={submittingVisit || user.role !== 'DOCTOR'}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow transition disabled:opacity-50"
                        >
                          {submittingVisit
                            ? 'Saving Visit...'
                            : user.role !== 'DOCTOR'
                            ? 'Doctors Only (Read Only)'
                            : isFollowup
                            ? 'Save Follow-up Note'
                            : 'Save Visit Notes'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* Past Visit Logs & Addenda */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-3">
                    Past Visit History ({selectedAdmission.doctor_visits?.length || 0})
                  </span>
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {selectedAdmission.doctor_visits && selectedAdmission.doctor_visits.length > 0 ? (
                      selectedAdmission.doctor_visits.map((v) => (
                        <div key={v.id} className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs">
                          <div className="flex justify-between items-center text-slate-400 mb-1">
                            <span className="font-semibold text-white">Dr. {v.doctor_name}</span>
                            <span>{v.date} ({new Date(v.visited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                          </div>
                          {v.is_urgent && (
                            <div className="text-[10px] text-amber-400 font-bold mb-1">
                              [URGENT OVERRIDE: {v.urgent_reason}]
                            </div>
                          )}
                          <p className="text-slate-200 mt-1">{v.treatment_notes}</p>

                          {/* Existing Addenda */}
                          {v.addenda && v.addenda.length > 0 && (
                            <div className="mt-2 pl-3 border-l-2 border-blue-500 space-y-1">
                              {v.addenda.map((ad) => (
                                <div key={ad.id} className="text-[11px] text-blue-200">
                                  <span className="font-semibold text-blue-300">Addendum by Dr. {ad.doctor_name}:</span>{' '}
                                  {ad.note}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add Addendum button for Doctor */}
                          {user.role === 'DOCTOR' && (
                            <div className="mt-2 pt-2 border-t border-slate-800 flex justify-end">
                              {addingAddendumVisitId === v.id ? (
                                <div className="w-full space-y-2 mt-1">
                                  <input
                                    type="text"
                                    value={addendumNote}
                                    onChange={(e) => setAddendumNote(e.target.value)}
                                    placeholder="Enter addendum note..."
                                    className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white"
                                    autoFocus
                                  />
                                  <div className="flex justify-end space-x-1.5">
                                    <button
                                      onClick={() => setAddingAddendumVisitId(null)}
                                      className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[11px]"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleAddAddendum(v.id)}
                                      className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] font-bold"
                                    >
                                      Save Addendum
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setAddingAddendumVisitId(v.id);
                                    setAddendumNote('');
                                  }}
                                  className="text-[11px] text-slate-400 hover:text-blue-400 flex items-center space-x-1"
                                >
                                  <PlusCircle className="h-3 w-3" />
                                  <span>Add Addendum</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">No previous clinical visits logged.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Death Modal */}
      {showDeathModal && selectedAdmission && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-red-800 rounded-xl max-w-md w-full p-6 text-white shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400 mb-3">
              <Skull className="h-7 w-7" />
              <h3 className="text-lg font-bold text-white">Record Patient Deceased</h3>
            </div>
            <p className="text-xs text-slate-300 mb-4">
              Patient: <span className="font-bold text-white">{selectedAdmission.patient.name}</span> (Room {selectedAdmission.room_number}). This action will mark the case as Deceased, immediately free the room, recalculate the mortality rate, and trigger a critical alert if benchmark is exceeded.
            </p>

            <form onSubmit={handleRecordDeath} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Clinical Death Notes & Complications <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={deathNotes}
                  onChange={(e) => setDeathNotes(e.target.value)}
                  placeholder="e.g. Acute multi-organ failure secondary to viral complications."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeathModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deathSubmitting}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg text-xs disabled:opacity-50"
                >
                  {deathSubmitting ? 'Recording...' : 'Confirm Death'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
