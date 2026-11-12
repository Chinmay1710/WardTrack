'use client';

import React, { useState, useEffect } from 'react';
import { AuditLog } from '@/types';
import { apiRequest } from '@/lib/api';
import { ScrollText, Search, ShieldCheck, Filter } from 'lucide-react';

export default function AuditLogScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data: AuditLog[] = await apiRequest('/audit-logs/');
      setLogs(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.reason && l.reason.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesAction = !actionFilter || l.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-purple-600 rounded-lg text-white">
              <ScrollText className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-white tracking-tight">Security & Clinical Audit Trail</h2>
                <span className="bg-purple-950 text-purple-200 text-xs px-2 py-0.5 rounded border border-purple-800 flex items-center space-x-1 font-semibold">
                  <ShieldCheck className="h-3 w-3 text-purple-400" />
                  <span>Append-Only</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Immutable ledger of all clinical, access, administrative, and configuration activities.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search user, action, entity..."
                className="bg-slate-950 border border-slate-700 text-xs rounded-lg pl-9 pr-3.5 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 w-56"
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All Action Types</option>
              {uniqueActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading audit records...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No matching audit log records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 uppercase text-slate-400 tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User & Role</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Old Value</th>
                  <th className="px-4 py-3">New Value</th>
                  <th className="px-4 py-3">Reason / Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-white">{l.username}</span>
                      <span className="text-[10px] text-slate-400 block">{l.role || 'System'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] font-bold text-blue-300 bg-blue-950/70 px-2 py-0.5 rounded border border-blue-900">
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {l.entity} {l.entity_id && `#${l.entity_id}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                      {l.old_value ? JSON.stringify(l.old_value) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-emerald-300 max-w-xs truncate">
                      {l.new_value ? JSON.stringify(l.new_value) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-300 italic max-w-sm">
                      {l.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

