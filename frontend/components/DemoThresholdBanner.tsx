'use client';

import React, { useState } from 'react';
import { User } from '@/types';
import { AlertCircle, Check, Settings } from 'lucide-react';
import { apiRequest } from '@/lib/api';

interface DemoThresholdBannerProps {
  bannerText: string;
  isConfigured: boolean;
  user: User;
  onThresholdUpdated?: () => void;
}

export default function DemoThresholdBanner({
  bannerText,
  isConfigured,
  user,
  onThresholdUpdated,
}: DemoThresholdBannerProps) {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [thresholdVal, setThresholdVal] = useState('37.5');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (isConfigured || !bannerText) {
    return null;
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      await apiRequest('/settings/', {
        method: 'POST',
        body: JSON.stringify({
          key: 'fever_threshold_celsius',
          value: thresholdVal,
        }),
      });
      setShowConfigModal(false);
      if (onThresholdUpdated) onThresholdUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update threshold.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-amber-950 border border-amber-800 text-amber-200 px-4 py-3 rounded-lg mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow">
        <div className="flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <span className="font-semibold text-sm text-amber-100">Threshold Notice: </span>
            <span className="text-sm">{bannerText}</span>
            <p className="text-xs text-amber-400 mt-0.5">
              * Discharge eligibility computation is paused until confirmed by the Head Doctor.
            </p>
          </div>
        </div>

        {user.is_head_doctor && (
          <button
            onClick={() => setShowConfigModal(true)}
            className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0"
          >
            <Settings className="h-4 w-4" />
            <span>Confirm / Change Threshold</span>
          </button>
        )}
      </div>

      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-6 text-white shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Set Medical Fever Threshold</h3>
            <p className="text-xs text-slate-300 mb-4">
              As Head Doctor, specify the facility-wide temperature threshold above which a reading is classified as FEVER.
            </p>

            {errorMsg && (
              <div className="bg-red-950/80 border border-red-800 text-red-200 p-2.5 rounded text-xs mb-3">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleUpdate}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Threshold (°C)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="35.0"
                  max="41.0"
                  value={thresholdVal}
                  onChange={(e) => setThresholdVal(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-base font-semibold text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>{submitting ? 'Saving...' : 'Confirm Threshold'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
