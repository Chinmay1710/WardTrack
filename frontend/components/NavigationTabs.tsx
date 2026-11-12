'use client';

import React from 'react';
import { UserRole } from '@/types';
import {
  LayoutDashboard,
  Thermometer,
  Stethoscope,
  UserPlus,
  CheckCircle2,
  Building2,
  BarChart3,
  ScrollText,
  Users,
} from 'lucide-react';

export type TabKey =
  | 'dashboard'
  | 'temperatures'
  | 'visits'
  | 'register'
  | 'discharges'
  | 'occupancy'
  | 'reports'
  | 'audit'
  | 'users';

interface NavigationTabsProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  role: UserRole;
}

export default function NavigationTabs({ activeTab, onTabChange, role }: NavigationTabsProps) {
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['NURSE', 'DOCTOR', 'ADMIN', 'MANAGER'] },
    { key: 'temperatures', label: 'Temperature Worklist', icon: Thermometer, roles: ['NURSE', 'DOCTOR'] },
    { key: 'visits', label: 'Doctor Visits', icon: Stethoscope, roles: ['DOCTOR', 'NURSE'] },
    { key: 'register', label: 'Patient Registration', icon: UserPlus, roles: ['ADMIN'] },
    { key: 'discharges', label: 'Discharge Management', icon: CheckCircle2, roles: ['DOCTOR', 'ADMIN'] },
    { key: 'occupancy', label: 'Room Occupancy (74)', icon: Building2, roles: ['NURSE', 'DOCTOR', 'ADMIN', 'MANAGER'] },
    { key: 'reports', label: 'Reports & Mortality', icon: BarChart3, roles: ['MANAGER', 'DOCTOR'] },
    { key: 'audit', label: 'Audit Log', icon: ScrollText, roles: ['MANAGER'] },
    { key: 'users', label: 'User Management', icon: Users, roles: ['MANAGER'] },
  ];

  const visibleTabs = tabs.filter((t) => t.roles.includes(role));

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 overflow-x-auto py-2 scrollbar-none">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key as TabKey)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
