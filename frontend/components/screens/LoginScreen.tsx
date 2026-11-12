'use client';

import React, { useState } from 'react';
import { apiRequest, setAuthTokens } from '@/lib/api';
import { HeartPulse, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { User as UserType } from '@/types';

interface LoginScreenProps {
  onLoginSuccess: (user: UserType) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('nurse1');
  const [password, setPassword] = useState('pass123');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const demoAccounts = [
    { username: 'nurse1', label: 'Nurse', desc: 'Florence N. • Record temps & worklist' },
    { username: 'doctor1', label: 'Doctor', desc: 'Dr. House • Visits & discharge sign-off' },
    { username: 'doctor_head', label: 'Head Doctor', desc: 'Dr. Blackwell • Change fever threshold' },
    { username: 'admin1', label: 'Admin Staff', desc: 'Arthur D. • Patient registration & discharges' },
    { username: 'manager1', label: 'Hospital Manager', desc: 'Sarah C. • Reports, audit & alerts' },
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await apiRequest('/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });

      setAuthTokens(res.access, res.refresh);
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(res.user));
      }
      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const selectDemoAccount = (accUsername: string) => {
    setUsername(accUsername);
    setPassword('pass123');
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 mb-3">
          <HeartPulse className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">
          AURA VIRUS TREATMENT CENTRE
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Quarantine & Clinical Management System (74 Rooms)
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-xl rounded-2xl sm:px-10">
          {errorMsg && (
            <div className="bg-red-950/80 border border-red-800 text-red-200 p-3 rounded-lg text-xs mb-5 flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
                Username
              </label>
              <div className="relative">
                <User className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In to Facility'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* 1-Click Demo Profiles */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <span className="text-[11px] uppercase font-bold text-slate-400 block mb-2.5 tracking-wider">
              1-Click Demo Roles (Auto-Fill):
            </span>
            <div className="grid grid-cols-1 gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => selectDemoAccount(acc.username)}
                  className={`text-left p-2 rounded-lg border transition flex items-center justify-between text-xs ${
                    username === acc.username
                      ? 'bg-blue-950/70 border-blue-600 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <span className="font-bold text-white block">{acc.label}</span>
                    <span className="text-[11px] text-slate-400">{acc.desc}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 font-semibold bg-slate-900 px-2 py-1 rounded">
                    @{acc.username}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
