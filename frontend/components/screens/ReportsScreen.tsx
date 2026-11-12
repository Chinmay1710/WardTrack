'use client';

import React, { useState, useEffect } from 'react';
import { User } from '@/types';
import { apiRequest, getAuthToken } from '@/lib/api';
import {
  BarChart3,
  Download,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Building2,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  Award
} from 'lucide-react';

interface ReportsScreenProps {
  user: User;
}

export default function ReportsScreen({ user }: ReportsScreenProps) {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/reports/');
      setReportData(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleExportCsv = async () => {
    setDownloadingCsv(true);
    try {
      const token = getAuthToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
      const response = await fetch(`${apiUrl}/reports/export_csv/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download CSV export.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facility_metrics_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'CSV export failed.');
    } finally {
      setDownloadingCsv(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400">Loading facility reports and analytics...</div>;
  }

  if (!reportData) {
    return <div className="p-12 text-center text-slate-400">No report metrics available.</div>;
  }

  const {
    mortality_rate,
    survival_rate,
    benchmark_line,
    survival_benchmark_line,
    rolling_30d_mortality,
    rolling_30d_warning,
    closed_cases,
    discharged_count,
    deceased_count,
    closed_cases_label,
    occupancy,
    missing_readings_count,
    missed_visits_count,
    extra_days_stayed_total,
    critical_alert,
  } = reportData;

  const isMortalityAlert = mortality_rate > benchmark_line;

  return (
    <div className="space-y-6">
      {/* Header & CSV Export */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-600 rounded-lg text-white">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Epidemiological & Facility Performance Reports
              </h2>
              <p className="text-xs text-slate-400">
                Official clinical metrics, mortality benchmarks, and compliance analytics.
              </p>
            </div>
          </div>

          {user.role === 'MANAGER' && (
            <button
              onClick={handleExportCsv}
              disabled={downloadingCsv}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-2 shadow disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>{downloadingCsv ? 'Exporting...' : 'Export Metrics CSV'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary KPI Row: Mortality & Survival vs Benchmark */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mortality Rate Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
              Mortality Rate vs 15% Benchmark
            </span>
            {isMortalityAlert ? (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-950 text-red-300 border border-red-800 flex items-center space-x-1">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                <span>EXCEEDED</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>WITHIN BENCHMARK</span>
              </span>
            )}
          </div>

          <div className="flex items-baseline space-x-3 mb-2">
            <span className={`text-4xl font-extrabold ${isMortalityAlert ? 'text-red-400' : 'text-white'}`}>
              {mortality_rate}%
            </span>
            <span className="text-xs text-slate-400">
              ({deceased_count} deaths out of {closed_cases} closed cases)
            </span>
          </div>

          {closed_cases_label && (
            <div className="text-xs text-amber-400 italic mb-4">
              * Note: {closed_cases_label}
            </div>
          )}

          {/* Progress bar comparison */}
          <div className="space-y-1.5 mt-4">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Facility Rate: {mortality_rate}%</span>
              <span>Benchmark Limit: {benchmark_line}%</span>
            </div>
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden relative border border-slate-800">
              <div
                className={`h-full ${isMortalityAlert ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(mortality_rate * 2, 100)}%` }}
              ></div>
              {/* Benchmark marker line at 15% */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                style={{ left: `${benchmark_line * 2}%` }}
                title="15% Benchmark Threshold"
              ></div>
            </div>
          </div>

          {/* Rolling 30d metric */}
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Rolling 30-Day Rate:</span>
            <span className={`font-bold ${rolling_30d_warning ? 'text-amber-400' : 'text-slate-200'}`}>
              {rolling_30d_mortality}%
              {rolling_30d_warning && ' (Warning: exceeds 15%)'}
            </span>
          </div>
        </div>

        {/* Survival Rate Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
              Cured Survival Rate vs 85% Benchmark
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-950 text-blue-300 border border-blue-800 flex items-center space-x-1">
              <Award className="h-3.5 w-3.5" />
              <span>CURED CASES</span>
            </span>
          </div>

          <div className="flex items-baseline space-x-3 mb-2">
            <span className="text-4xl font-extrabold text-emerald-400">
              {survival_rate}%
            </span>
            <span className="text-xs text-slate-400">
              ({discharged_count} discharged cured out of {closed_cases} closed cases)
            </span>
          </div>

          {/* Progress bar comparison */}
          <div className="space-y-1.5 mt-4">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Facility Survival: {survival_rate}%</span>
              <span>Benchmark Target: {survival_benchmark_line}%</span>
            </div>
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden relative border border-slate-800">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${Math.min(survival_rate, 100)}%` }}
              ></div>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-300 z-10"
                style={{ left: `${survival_benchmark_line}%` }}
                title="85% Target Survival"
              ></div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Total Successful Discharges:</span>
            <span className="font-bold text-emerald-400">{discharged_count} patients</span>
          </div>
        </div>
      </div>

      {/* Operational Compliance & Discharge Efficiency Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-amber-950 text-amber-400 rounded-lg">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold text-slate-400">Missing Readings</div>
              <div className="text-2xl font-extrabold text-white">{missing_readings_count}</div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Closed calendar days where no official temperature was recorded.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-red-950 text-red-400 rounded-lg">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold text-slate-400">Missed Clinical Visits</div>
              <div className="text-2xl font-extrabold text-white">{missed_visits_count}</div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Days where temperature existed but no doctor visit occurred before daily closure.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-950 text-blue-400 rounded-lg">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold text-slate-400">Extra Days Stayed</div>
              <div className="text-2xl font-extrabold text-white">{extra_days_stayed_total}</div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Cumulative patient days spent in facility after reaching 3 fever-free days.
          </p>
        </div>
      </div>
    </div>
  );
}
