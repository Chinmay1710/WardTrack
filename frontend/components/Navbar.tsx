'use client';

import React from 'react';
import { User } from '@/types';
import { clearAuthTokens } from '@/lib/api';
import { ShieldAlert, UserCheck, LogOut, HeartPulse } from 'lucide-react';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  onRoleSwitch: (username: string) => void;
}

export default function Navbar({ user, onLogout, onRoleSwitch }: NavbarProps) {
  const roleColors: Record<string, string> = {
    NURSE: 'bg-emerald-800 text-emerald-100 border-emerald-700',
    DOCTOR: 'bg-blue-800 text-blue-100 border-blue-700',
    ADMIN: 'bg-amber-800 text-amber-100 border-amber-700',
    MANAGER: 'bg-purple-800 text-purple-100 border-purple-700',
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Facility Title */}
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <HeartPulse className="h-6 w-6" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white block">
                AURA VIRUS TREATMENT CENTRE
              </span>
              <span className="text-xs text-slate-400">
                Quarantine & Clinical Management Facility (74 Rooms)
              </span>
            </div>
          </div>

          {/* Quick Demo Role Switcher */}
          <div className="hidden lg:flex items-center space-x-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-400 px-2 font-medium">Quick Switch:</span>
            {[
              { id: 'nurse1', label: 'Nurse' },
              { id: 'doctor1', label: 'Doctor' },
              { id: 'doctor_head', label: 'Head Dr' },
              { id: 'admin1', label: 'Admin' },
              { id: 'manager1', label: 'Manager' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => onRoleSwitch(btn.id)}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  user.username === btn.id
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* User profile & Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-semibold flex items-center justify-end space-x-1.5">
                <span>{user.first_name ? `${user.first_name} ${user.last_name}` : user.username}</span>
                {user.is_head_doctor && (
                  <span className="bg-indigo-900 text-indigo-200 text-xs px-2 py-0.5 rounded border border-indigo-700 font-medium">
                    Head Doctor
                  </span>
                )}
              </div>
              <div className="flex items-center justify-end space-x-2 mt-0.5">
                <span className={`text-[11px] px-2 py-0.2 rounded-full border ${roleColors[user.role] || 'bg-slate-800'}`}>
                  {user.role}
                </span>
                <span className="text-xs text-slate-400">@{user.username}</span>
              </div>
            </div>

            <button
              onClick={onLogout}
              title="Logout"
              className="p-2 rounded-lg bg-slate-800 hover:bg-red-950 hover:text-red-300 text-slate-300 transition border border-slate-700"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

