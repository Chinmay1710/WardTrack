'use client';

import React, { useState } from 'react';
import { CriticalAlert, User } from '@/types';
import { AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import { apiRequest } from '@/lib/api';

interface CriticalAlertBannerProps {
  alert: CriticalAlert | null | undefined;
  user: User;
  closedCasesLabel?: string | null;
  onAlertAcknowledged?: () => void;
}

export default function CriticalAlertBanner({
  alert,
  user,
  closedCasesLabel,
  onAlertAcknowledged,
}: CriticalAlertBannerProps) {
  const [showAckModal, setShowAckModal] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!alert || !alert.is_active) {
    return null;
  }

  // Red banner on Manager and Doctor dashboards
  if (user.role !== 'MANAGER' && user.role !== 'DOCTOR') {
    return null;
  }

  const handleAcknowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      setErrorMsg('Comment is required to acknowledge this critical alert.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      await apiRequest('/reports/acknowledge_alert/', {
        method: 'POST',
        body: JSON.stringify({
          alert_id: alert.id,
          comment: comment.trim(),
        }),
      });
      setShowAckModal(false);
      setComment('');
      if (onAlertAcknowledged) onAlertAcknowledged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to acknowledge alert.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-red-900 border-l-4 border-red-500 text-red-100 p-4 shadow-lg mb-6 rounded-r-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="bg-red-800 p-2 rounded-full text-red-200">
              <AlertTriangle className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="font-bold text-base flex items-center space-x-2">
                <span>CRITICAL ALERT: Mortality Benchmark Exceeded</span>
                <span className="bg-red-950 text-red-200 text-xs px-2 py-0.5 rounded border border-red-700 font-semibold">
                  {alert.mortality_rate}%
                </span>
              </div>
              <p className="text-sm text-red-200 mt-0.5">
                Current mortality rate exceeds the 15% threshold ({alert.deaths_count} deaths out of {alert.closed_cases_count} closed cases).
                {closedCasesLabel && (
                  <span className="ml-2 italic bg-red-950/60 px-2 py-0.5 rounded text-xs text-red-300">
                    ({closedCasesLabel})
                  </span>
                )}
              </p>
              {alert.acknowledged_by_name && (
                <p className="text-xs text-red-300 mt-1">
                  Acknowledged by {alert.acknowledged_by_name}: &ldquo;{alert.acknowledgement_comment}&rdquo;
                </p>
              )}
            </div>
          </div>

          {user.role === 'MANAGER' && !alert.acknowledged_by_name && (
            <button
              onClick={() => setShowAckModal(true)}
              className="bg-white text-red-900 hover:bg-red-50 px-4 py-2 rounded-lg font-bold text-sm shadow transition shrink-0"
            >
              Acknowledge Alert
            </button>
          )}
        </div>
      </div>

      {/* Acknowledge Modal for Manager */}
      {showAckModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 text-white shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400 mb-4">
              <ShieldAlert className="h-7 w-7" />
              <h3 className="text-lg font-bold text-white">Acknowledge Critical Alert</h3>
            </div>
            <p className="text-sm text-slate-300 mb-4">
              Please enter an official management remark explaining the review or action initiated in response to the {alert.mortality_rate}% mortality rate.
            </p>

            {errorMsg && (
              <div className="bg-red-950/80 border border-red-800 text-red-200 p-2.5 rounded text-xs mb-3">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAcknowledge}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Manager Review Comment <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g., Clinical audit initiated with head doctor; treatment protocols under active review."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAckModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                >
                  {submitting ? 'Acknowledging...' : 'Submit Acknowledgement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

