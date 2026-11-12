'use client';

import React, { useState, useEffect } from 'react';
import { Admission, TemperatureReading, User } from '@/types';
import { apiRequest } from '@/lib/api';
import {
  Thermometer,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  History,
  Edit2,
  Check,
  X
} from 'lucide-react';

interface NurseTemperatureScreenProps {
  initialFilter?: string;
  user: User;
  onReadingLogged?: () => void;
}

export default function NurseTemperatureScreen({
  initialFilter = 'pending',
  user,
  onReadingLogged,
}: NurseTemperatureScreenProps) {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'pending' | 'done' | 'all' | 'missing'>(
    (initialFilter as any) || 'pending'
  );
  const [searchTerm, setSearchTerm] = useState('');

  // Recording Modal state
  const [activeAdmission, setActiveAdmission] = useState<Admission | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [confirmOutOfRange, setConfirmOutOfRange] = useState(false);
  const [needsRangeConfirmPrompt, setNeedsRangeConfirmPrompt] = useState(false);
  const [isAdditional, setIsAdditional] = useState(false);
  const [additionalReason, setAdditionalReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recordError, setRecordError] = useState('');

  // Amend Modal state
  const [amendingReading, setAmendingReading] = useState<TemperatureReading | null>(null);
  const [amendTemp, setAmendTemp] = useState('');
  const [amendReason, setAmendReason] = useState('');
  const [amendSubmitting, setAmendSubmitting] = useState(false);
  const [amendError, setAmendError] = useState('');

  // History Drawer state
  const [viewHistoryAdmission, setViewHistoryAdmission] = useState<Admission | null>(null);

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

  const openRecordModal = (admission: Admission) => {
    setActiveAdmission(admission);
    setTempValue('');
    setConfirmOutOfRange(false);
    setNeedsRangeConfirmPrompt(false);
    setIsAdditional(user.role === 'DOCTOR');
    setAdditionalReason('');
    setRecordError('');
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAdmission || !tempValue) return;

    const numTemp = parseFloat(tempValue);
    if ((numTemp < 34.0 || numTemp > 42.0) && !confirmOutOfRange) {
      setNeedsRangeConfirmPrompt(true);
      setRecordError(`Temperature ${numTemp}°C is outside plausible range (34.0°C - 42.0°C). Please confirm.`);
      return;
    }

    setSubmitting(true);
    setRecordError('');

    try {
      await apiRequest('/temperatures/', {
        method: 'POST',
        body: JSON.stringify({
          admission: activeAdmission.id,
          temperature_celsius: numTemp,
          confirm_out_of_range: confirmOutOfRange,
          is_additional: isAdditional,
          additional_reason: additionalReason,
        }),
      });

      setActiveAdmission(null);
      fetchAdmissions();
      if (onReadingLogged) onReadingLogged();
    } catch (err: any) {
      setRecordError(err.message || 'Failed to record temperature.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendingReading || !amendTemp || !amendReason.trim()) {
      setAmendError('Temperature and mandatory reason are required.');
      return;
    }

    setAmendSubmitting(true);
    setAmendError('');

    try {
      await apiRequest(`/temperatures/${amendingReading.id}/amend/`, {
        method: 'PATCH',
        body: JSON.stringify({
          temperature_celsius: parseFloat(amendTemp),
          reason: amendReason.trim(),
        }),
      });

      setAmendingReading(null);
      setAmendReason('');
      setAmendTemp('');
      fetchAdmissions();
      if (onReadingLogged) onReadingLogged();
    } catch (err: any) {
      setAmendError(err.message || 'Failed to amend temperature.');
    } finally {
      setAmendSubmitting(false);
    }
  };

  // Filter admissions
  const filteredAdmissions = admissions.filter((adm) => {
    const matchesSearch =
      adm.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(adm.room_number || '').includes(searchTerm);

    if (!matchesSearch) return false;

    if (filterTab === 'pending') {
      return !adm.today_status.has_temperature_today;
    }
    if (filterTab === 'done') {
      return adm.today_status.has_temperature_today;
    }
    if (filterTab === 'missing') {
      return adm.streak_info.day_history.some((d) => d.status === 'MISSING');
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <Thermometer className="h-6 w-6 text-blue-400" />
              <span>Daily Temperature Worklist</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Protocol: One official reading per patient per calendar day. Server timestamps applied automatically.
            </p>
          </div>

          <div className="flex items-center space-x-2">
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
        </div>

        {/* Tab Filters */}
        <div className="flex space-x-2 mt-4 pt-4 border-t border-slate-800">
          {[
            { id: 'pending', label: 'Pending Today', icon: Clock },
            { id: 'done', label: 'Completed Today', icon: CheckCircle2 },
            { id: 'missing', label: 'Missing History', icon: AlertCircle },
            { id: 'all', label: 'All Active Patients', icon: Thermometer },
          ].map((tab) => {
            const Icon = tab.icon;
            const count =
              tab.id === 'pending'
                ? admissions.filter((a) => !a.today_status.has_temperature_today).length
                : tab.id === 'done'
                ? admissions.filter((a) => a.today_status.has_temperature_today).length
                : tab.id === 'missing'
                ? admissions.filter((a) => a.streak_info.day_history.some((d) => d.status === 'MISSING')).length
                : admissions.length;

            return (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
                  filterTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Patients Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading patients worklist...</div>
        ) : filteredAdmissions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            No patients found matching the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 text-xs uppercase text-slate-400 tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Room</th>
                  <th className="px-5 py-3">Patient</th>
                  <th className="px-5 py-3">Age / Sex</th>
                  <th className="px-5 py-3">Today&apos;s Status</th>
                  <th className="px-5 py-3">Fever-Free Streak</th>
                  <th className="px-5 py-3">Latest Reading</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredAdmissions.map((adm) => {
                  const hasToday = adm.today_status.has_temperature_today;
                  const latestReading = adm.temperature_readings?.[0];

                  return (
                    <tr key={adm.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 font-bold text-white">
                        <span className="px-2.5 py-1 bg-slate-800 rounded-md border border-slate-700">
                          Room {adm.room_number || 'N/A'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-white">{adm.patient.name}</div>
                        <div className="text-xs text-slate-400">{adm.patient.contact || 'No contact'}</div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-300">
                        {adm.patient.age}y / {adm.patient.sex}
                      </td>
                      <td className="px-5 py-3.5">
                        {hasToday ? (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Done Today</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Pending Today</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-white text-base">
                            {adm.streak_info.streak_count}
                          </span>
                          <span className="text-xs text-slate-400">days</span>
                          {adm.streak_info.is_eligible && (
                            <span className="bg-blue-950 text-blue-300 text-[10px] px-1.5 py-0.5 rounded border border-blue-800 font-semibold">
                              Eligible
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {latestReading ? (
                          <div>
                            <span className="font-bold text-white text-sm">
                              {latestReading.temperature_celsius}°C
                            </span>
                            <span className="text-slate-400 block text-[11px]">
                              {latestReading.date} by {latestReading.recorded_by_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">No readings</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <button
                          onClick={() => setViewHistoryAdmission(adm)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
                        >
                          History
                        </button>

                        <button
                          onClick={() => openRecordModal(adm)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow ${
                            hasToday
                              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
                        >
                          {hasToday ? 'Record Additional' : 'Record Temp'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Temperature Modal */}
      {activeAdmission && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">Record Temperature</h3>
                <p className="text-xs text-slate-400">
                  Patient: {activeAdmission.patient.name} (Room {activeAdmission.room_number})
                </p>
              </div>
              <button
                onClick={() => setActiveAdmission(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {recordError && (
              <div className="bg-red-950/80 border border-red-800 text-red-200 p-3 rounded-lg text-xs mb-4 flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <div>{recordError}</div>
              </div>
            )}

            <form onSubmit={handleRecordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                  Temperature Reading (°C) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="30.0"
                    max="45.0"
                    value={tempValue}
                    onChange={(e) => {
                      setTempValue(e.target.value);
                      setNeedsRangeConfirmPrompt(false);
                      setConfirmOutOfRange(false);
                      setRecordError('');
                    }}
                    placeholder="e.g. 36.8"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-lg font-bold text-white focus:outline-none focus:border-blue-500"
                    required
                    autoFocus
                  />
                  <span className="absolute right-3.5 top-3 text-slate-400 text-sm font-semibold">
                    °C
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Plausible clinical range: 34.0°C – 42.0°C.
                </p>
              </div>

              {/* Plausible range confirmation toggle */}
              {needsRangeConfirmPrompt && (
                <div className="bg-amber-950/60 border border-amber-800 p-3 rounded-lg">
                  <label className="flex items-center space-x-2 text-xs text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmOutOfRange}
                      onChange={(e) => setConfirmOutOfRange(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0 h-4 w-4"
                    />
                    <span className="font-semibold">
                      Confirm out-of-range value is clinically verified and intentional.
                    </span>
                  </label>
                </div>
              )}

              {/* Additional reading controls */}
              {activeAdmission.today_status.has_temperature_today && (
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-amber-400 block">
                    Notice: An official reading already exists for today.
                  </span>
                  {user.role === 'DOCTOR' ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                        Doctor Additional Reading Reason <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={additionalReason}
                        onChange={(e) => setAdditionalReason(e.target.value)}
                        placeholder="e.g. Evening fever spike observation"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Only a Doctor can add an additional reading once the daily official entry is recorded.
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAdmission(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Temperature'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History & Amendment Drawer/Modal */}
      {viewHistoryAdmission && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 text-white shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Temperature History: {viewHistoryAdmission.patient.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Room {viewHistoryAdmission.room_number} • Current Fever-Free Streak:{' '}
                  <span className="text-emerald-400 font-bold">
                    {viewHistoryAdmission.streak_info.streak_count} days
                  </span>
                </p>
              </div>
              <button
                onClick={() => setViewHistoryAdmission(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {viewHistoryAdmission.temperature_readings && viewHistoryAdmission.temperature_readings.length > 0 ? (
                viewHistoryAdmission.temperature_readings.map((reading) => (
                  <div
                    key={reading.id}
                    className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-bold text-white">
                          {reading.temperature_celsius}°C
                        </span>
                        {reading.is_additional && (
                          <span className="bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800 font-semibold text-[10px]">
                            Additional
                          </span>
                        )}
                        {reading.approval_status === 'PENDING_APPROVAL' && (
                          <span className="bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800 font-semibold text-[10px]">
                            Pending Doctor Approval
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        Recorded on {reading.date} at {new Date(reading.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {reading.recorded_by_name}
                      </div>
                      {reading.amendment_reason && (
                        <div className="text-amber-400 mt-1 italic">
                          Amended: {reading.amendment_reason}
                        </div>
                      )}
                    </div>

                    {(user.role === 'NURSE' || user.role === 'DOCTOR') && (
                      <button
                        onClick={() => {
                          setAmendingReading(reading);
                          setAmendTemp(String(reading.temperature_celsius || ''));
                          setAmendReason('');
                          setAmendError('');
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center space-x-1"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Amend</span>
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-slate-500 p-6 text-center italic">No temperature readings on record.</div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setViewHistoryAdmission(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Amend Reading Modal */}
      {amendingReading && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-5 text-white shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Amend Temperature Reading</h3>
            <p className="text-xs text-slate-400 mb-3">
              Nurse can amend own entry same day with mandatory reason. Older entries or other users require Doctor approval.
            </p>

            {amendError && (
              <div className="bg-red-950/80 border border-red-800 text-red-200 p-2.5 rounded text-xs mb-3">
                {amendError}
              </div>
            )}

            <form onSubmit={handleAmendSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Corrected Value (°C) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="30.0"
                  max="45.0"
                  value={amendTemp}
                  onChange={(e) => setAmendTemp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Mandatory Reason for Amendment <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={2}
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  placeholder="e.g. Typographical error during shift handover"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAmendingReading(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={amendSubmitting}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs disabled:opacity-50"
                >
                  {amendSubmitting ? 'Saving...' : 'Submit Amendment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

