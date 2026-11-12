'use client';

import React, { useState, useEffect } from 'react';
import { Room, WaitingListEntry, User } from '@/types';
import { apiRequest } from '@/lib/api';
import {
  Building2,
  Clock,
  ArrowRightLeft,
  Wrench,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  X,
  Search
} from 'lucide-react';

interface OccupancyScreenProps {
  user: User;
  onRoomUpdated?: () => void;
}

export default function OccupancyScreen({ user, onRoomUpdated }: OccupancyScreenProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [targetRoomId, setTargetRoomId] = useState<number | ''>('');
  const [transferReason, setTransferReason] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRoomsAndWaiting = async () => {
    setLoading(true);
    try {
      const [roomsData, waitData] = await Promise.all([
        apiRequest('/rooms/'),
        user.role === 'ADMIN' ? apiRequest('/waiting-list/') : Promise.resolve([]),
      ]);
      setRooms(roomsData);
      setWaitingList(waitData);

      if (selectedRoom) {
        const updated = roomsData.find((r: Room) => r.id === selectedRoom.id);
        if (updated) setSelectedRoom(updated);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomsAndWaiting();
  }, []);

  const total = rooms.length;
  const occupied = rooms.filter((r) => r.status === 'OCCUPIED').length;
  const vacant = rooms.filter((r) => r.status === 'VACANT').length;
  const outOfService = rooms.filter((r) => r.status === 'OUT_OF_SERVICE').length;
  const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  // Counter amber at 90%, red at 100%
  const counterStyle =
    rate >= 100
      ? 'bg-red-950 text-red-200 border-red-700'
      : rate >= 90
      ? 'bg-amber-950 text-amber-200 border-amber-700'
      : 'bg-emerald-950 text-emerald-200 border-emerald-700';

  const handleToggleOutOfService = async (room: Room) => {
    setStatusMsg(null);
    try {
      const isCurrentlyOut = room.status === 'OUT_OF_SERVICE';
      await apiRequest(`/rooms/${room.id}/mark_out_of_service/`, {
        method: 'PATCH',
        body: JSON.stringify({
          out_of_service: !isCurrentlyOut,
          notes: !isCurrentlyOut ? 'Scheduled maintenance' : '',
        }),
      });
      setStatusMsg({
        type: 'success',
        text: `Room ${room.number} updated to ${!isCurrentlyOut ? 'Out of Service' : 'Vacant'}.`,
      });
      fetchRoomsAndWaiting();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Action failed.' });
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !selectedRoom.active_admission || !targetRoomId) return;

    setTransferring(true);
    setStatusMsg(null);
    try {
      const admId = selectedRoom.active_admission.admission_id;
      const res = await apiRequest(`/admissions/${admId}/transfer_room/`, {
        method: 'POST',
        body: JSON.stringify({
          target_room_id: targetRoomId,
          reason: transferReason.trim() || 'Administrative bed re-assignment',
        }),
      });

      setStatusMsg({
        type: 'success',
        text: res.detail || 'Patient transferred successfully.',
      });
      setShowTransferModal(false);
      setTransferReason('');
      setTargetRoomId('');
      fetchRoomsAndWaiting();
      if (onRoomUpdated) onRoomUpdated();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Transfer failed.' });
    } finally {
      setTransferring(false);
    }
  };

  const vacantRooms = rooms.filter((r) => r.status === 'VACANT');

  return (
    <div className="space-y-6">
      {/* Header & Metrics */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-600 rounded-lg text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Facility Room Occupancy</h2>
              <p className="text-xs text-slate-400">
                Live status map of all 74 isolated treatment rooms. One active patient per room.
              </p>
            </div>
          </div>

          {/* Occupancy Counter Badge */}
          <div className={`px-5 py-3 rounded-xl border flex items-center space-x-4 shadow ${counterStyle}`}>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider">Facility Capacity</div>
              <div className="text-2xl font-black">
                {occupied} / {total} Rooms ({rate}%)
              </div>
            </div>
            <div className="text-xs font-semibold pl-3 border-l border-current/20">
              <div>Vacant: {vacant}</div>
              <div>Maintenance: {outOfService}</div>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-center space-x-2 border ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
                : 'bg-red-950/80 border-red-800 text-red-200'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            )}
            <div>{statusMsg.text}</div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-slate-800 text-xs">
          <span className="text-slate-400 font-semibold">Legend:</span>
          <div className="flex items-center space-x-1.5">
            <span className="w-3.5 h-3.5 rounded bg-blue-600 inline-block shadow"></span>
            <span className="text-slate-300 font-medium">Occupied ({occupied})</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3.5 h-3.5 rounded bg-slate-800 border border-slate-700 inline-block"></span>
            <span className="text-slate-300 font-medium">Vacant ({vacant})</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3.5 h-3.5 rounded bg-amber-600 inline-block"></span>
            <span className="text-slate-300 font-medium">Out of Service ({outOfService})</span>
          </div>
        </div>
      </div>

      {/* Grid of 74 Rooms */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
          Room Map (1 - 74)
        </h3>

        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading room map...</div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5">
            {rooms.map((room) => {
              const isOccupied = room.status === 'OCCUPIED';
              const isOut = room.status === 'OUT_OF_SERVICE';

              const boxColor = isOccupied
                ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-sm'
                : isOut
                ? 'bg-amber-700/80 hover:bg-amber-600 text-white border-amber-600'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800';

              return (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className={`h-16 rounded-lg border p-1.5 flex flex-col justify-between items-center transition cursor-pointer text-center relative ${boxColor}`}
                >
                  <span className="text-xs font-black">{room.number}</span>
                  <span className="text-[10px] font-semibold truncate w-full px-0.5">
                    {isOccupied
                      ? room.active_admission?.patient_name.split(' ')[0]
                      : isOut
                      ? 'Out'
                      : 'Vacant'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Waiting List (if entries exist) */}
      {waitingList.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">Active Waiting List</h3>
              <span className="bg-amber-950 text-amber-300 text-xs px-2 py-0.5 rounded-full font-semibold border border-amber-800">
                {waitingList.length}
              </span>
            </div>
            <span className="text-xs text-slate-400">Triage order</span>
          </div>

          <div className="divide-y divide-slate-800">
            {waitingList.map((entry, idx) => (
              <div key={entry.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-amber-400 font-bold mr-2">#{idx + 1}</span>
                  <span className="font-semibold text-white mr-2">{entry.patient_name}</span>
                  <span className="text-slate-400">
                    Age {entry.patient_age} • {entry.patient_sex} • Queued on{' '}
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                  {entry.notes && (
                    <span className="text-slate-400 block mt-0.5 italic">{entry.notes}</span>
                  )}
                </div>

                {user.role === 'ADMIN' && vacant > 0 && (
                  <button
                    onClick={() => {
                      alert(`Use the Patient Registration screen to assign a vacant room to ${entry.patient_name}.`);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs"
                  >
                    Admit to Vacant Room
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Room Details & Admin Controls Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Room #{selectedRoom.number} Details</h3>
              </div>
              <button
                onClick={() => setSelectedRoom(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs mb-6">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Status</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                    selectedRoom.status === 'OCCUPIED'
                      ? 'bg-blue-950 text-blue-300'
                      : selectedRoom.status === 'OUT_OF_SERVICE'
                      ? 'bg-amber-950 text-amber-300'
                      : 'bg-emerald-950 text-emerald-300'
                  }`}
                >
                  {selectedRoom.status}
                </span>
              </div>

              {selectedRoom.active_admission ? (
                <>
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Current Patient</span>
                    <span className="font-bold text-white text-sm">
                      {selectedRoom.active_admission.patient_name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Admitted At</span>
                    <span className="text-slate-200">
                      {new Date(selectedRoom.active_admission.admitted_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Discharge Trajectory</span>
                    <span className="font-semibold text-blue-300">
                      {selectedRoom.active_admission.discharge_status}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-slate-400 italic py-2">
                  No active admission assigned to this room.
                </div>
              )}

              {selectedRoom.notes && (
                <div className="py-1">
                  <span className="text-slate-400 block mb-1">Maintenance Notes:</span>
                  <p className="text-amber-300 bg-slate-950 p-2 rounded border border-slate-800">
                    {selectedRoom.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Admin Actions */}
            {user.role === 'ADMIN' && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <span className="text-[11px] uppercase font-bold text-slate-400 block mb-2">
                  Admin Room Controls:
                </span>

                {selectedRoom.status === 'OCCUPIED' && (
                  <button
                    onClick={() => {
                      setShowTransferModal(true);
                      setTargetRoomId(vacantRooms[0]?.id || '');
                    }}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    <span>Transfer Patient to Another Room</span>
                  </button>
                )}

                {selectedRoom.status !== 'OCCUPIED' && (
                  <button
                    onClick={() => handleToggleOutOfService(selectedRoom)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition border border-slate-700"
                  >
                    <Wrench className="h-4 w-4" />
                    <span>
                      {selectedRoom.status === 'OUT_OF_SERVICE'
                        ? 'Restore Room to Vacant Service'
                        : 'Mark Room Out of Service'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transfer Patient Modal */}
      {showTransferModal && selectedRoom && selectedRoom.active_admission && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-5 text-white shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Transfer Patient</h3>
            <p className="text-xs text-slate-400 mb-3">
              Transfer <span className="text-white font-semibold">{selectedRoom.active_admission.patient_name}</span> from Room {selectedRoom.number} to another vacant room.
            </p>

            <form onSubmit={handleExecuteTransfer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Destination Room <span className="text-red-400">*</span>
                </label>
                <select
                  value={targetRoomId}
                  onChange={(e) => setTargetRoomId(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="">Select vacant room...</option>
                  {vacantRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.number} (Vacant)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Transfer Reason
                </label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="e.g. Relocation for plumbing repair"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferring || !targetRoomId}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs disabled:opacity-50"
                >
                  {transferring ? 'Transferring...' : 'Execute Atomic Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
