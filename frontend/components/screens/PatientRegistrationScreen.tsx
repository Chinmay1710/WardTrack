'use client';

import React, { useState, useEffect } from 'react';
import { Room } from '@/types';
import { apiRequest } from '@/lib/api';
import { UserPlus, Building2, Clock, Check, AlertCircle } from 'lucide-react';

interface PatientRegistrationScreenProps {
  onSuccess?: () => void;
}

export default function PatientRegistrationScreen({ onSuccess }: PatientRegistrationScreenProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [contact, setContact] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<number | ''>('');
  const [addToWaitingList, setAddToWaitingList] = useState(false);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const data: Room[] = await apiRequest('/rooms/');
      setRooms(data);
      const vacant = data.filter((r) => r.status === 'VACANT');
      if (vacant.length > 0) {
        setSelectedRoomId(vacant[0].id);
        setAddToWaitingList(false);
      } else {
        setSelectedRoomId('');
        setAddToWaitingList(true);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const vacantRooms = rooms.filter((r) => r.status === 'VACANT');
  const hasVacantRooms = vacantRooms.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!name.trim() || !age) {
      setStatusMessage({ type: 'error', text: 'Name and age are required.' });
      return;
    }

    if (!hasVacantRooms && !addToWaitingList) {
      setStatusMessage({
        type: 'error',
        text: 'No vacant rooms available. You may add the patient to the waiting list.',
      });
      setAddToWaitingList(true);
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: name.trim(),
        age: parseInt(age, 10),
        sex,
        contact: contact.trim(),
        emergency_contact: emergencyContact.trim(),
        add_to_waiting_list: addToWaitingList,
        notes: notes.trim(),
      };

      if (!addToWaitingList && selectedRoomId) {
        payload.room_id = selectedRoomId;
      }

      const res = await apiRequest('/patients/register/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setStatusMessage({
        type: 'success',
        text: res.detail || 'Patient registered successfully!',
      });

      // Reset form
      setName('');
      setAge('');
      setContact('');
      setEmergencyContact('');
      setNotes('');
      fetchRooms();

      if (onSuccess) onSuccess();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Registration failed.',
      });
      // Refresh rooms if "This room was just taken."
      if (err.message && err.message.includes('just taken')) {
        fetchRooms();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-blue-600 rounded-lg text-white">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Register & Admit Patient</h2>
            <p className="text-sm text-slate-400">
              Admin workflow: Record demographic information and assign an available room (1-74).
            </p>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`p-4 rounded-lg mb-6 text-sm flex items-start space-x-3 border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
                : 'bg-red-950/70 border-red-800 text-red-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <Check className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>{statusMessage.text}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                  Age <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="125"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 42"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                  Sex <span className="text-red-400">*</span>
                </label>
                <select
                  value={sex}
                  onChange={(e: any) => setSex(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Patient Contact Phone
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. +1-555-0199"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
                Emergency Contact
              </label>
              <input
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="e.g. Spouse / Next of Kin: 555-0188"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Room Allocation / Waiting List Options */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
              Room Assignment
            </label>

            {!hasVacantRooms && (
              <div className="bg-amber-950/60 border border-amber-800 p-3 rounded-lg text-amber-200 text-xs mb-3 flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>All 74 quarantine rooms are currently occupied or out of service.</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <select
                  disabled={addToWaitingList || !hasVacantRooms || loadingRooms}
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm disabled:opacity-40"
                >
                  {hasVacantRooms ? (
                    vacantRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.number} (Vacant)
                      </option>
                    ))
                  ) : (
                    <option value="">No vacant rooms available</option>
                  )}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {hasVacantRooms
                    ? `${vacantRooms.length} vacant rooms available.`
                    : 'Facility is at full capacity.'}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer bg-slate-950 px-3.5 py-2.5 rounded-lg border border-slate-700 hover:border-slate-600">
                  <input
                    type="checkbox"
                    checked={addToWaitingList}
                    onChange={(e) => setAddToWaitingList(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 h-4 w-4"
                  />
                  <span className="flex items-center space-x-1.5">
                    <Clock className="h-4 w-4 text-amber-400" />
                    <span>Add to waiting list</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
              Registration Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Referred from City General triage; symptoms onset 4 days ago."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={submitting || loadingRooms}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow text-base transition disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <UserPlus className="h-5 w-5" />
              <span>
                {submitting
                  ? 'Processing Registration...'
                  : addToWaitingList
                  ? 'Register and Queue to Waiting List'
                  : 'Register and Admit Patient'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

