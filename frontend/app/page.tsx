'use client';

import React, { useState, useEffect } from 'react';
import { User, DashboardSummary } from '@/types';
import { apiRequest, clearAuthTokens, getCurrentUserStored, setAuthTokens } from '@/lib/api';
import Navbar from '@/components/Navbar';
import CriticalAlertBanner from '@/components/CriticalAlertBanner';
import DemoThresholdBanner from '@/components/DemoThresholdBanner';
import NavigationTabs, { TabKey } from '@/components/NavigationTabs';

import LoginScreen from '@/components/screens/LoginScreen';
import RoleDashboard from '@/components/screens/RoleDashboard';
import PatientRegistrationScreen from '@/components/screens/PatientRegistrationScreen';
import NurseTemperatureScreen from '@/components/screens/NurseTemperatureScreen';
import DoctorVisitScreen from '@/components/screens/DoctorVisitScreen';
import DischargeScreen from '@/components/screens/DischargeScreen';
import OccupancyScreen from '@/components/screens/OccupancyScreen';
import ReportsScreen from '@/components/screens/ReportsScreen';
import AuditLogScreen from '@/components/screens/AuditLogScreen';
import UserManagementScreen from '@/components/screens/UserManagementScreen';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [subFilter, setSubFilter] = useState<string | undefined>();

  // Global Dashboard & Alert data
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);

  // Fetch current user & dashboard on start
  const fetchDashboard = async () => {
    try {
      const summary: DashboardSummary = await apiRequest('/dashboard/summary/');
      setDashboardSummary(summary);
    } catch (err: any) {
      console.error('Failed to fetch dashboard summary', err);
    }
  };

  const loadUser = async () => {
    setLoadingUser(true);
    try {
      const user = await apiRequest<User>('/auth/me/');
      setCurrentUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      await fetchDashboard();
    } catch {
      clearAuthTokens();
      setCurrentUser(null);
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleLogout = () => {
    clearAuthTokens();
    setCurrentUser(null);
    setDashboardSummary(null);
    setActiveTab('dashboard');
  };

  const handleQuickRoleSwitch = async (targetUsername: string) => {
    try {
      const res = await apiRequest('/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ username: targetUsername, password: 'pass123' }),
      });
      setAuthTokens(res.access, res.refresh);
      localStorage.setItem('user', JSON.stringify(res.user));
      setCurrentUser(res.user);
      setActiveTab('dashboard');
      fetchDashboard();
    } catch (err: any) {
      alert(`Role switch to ${targetUsername} failed: ${err.message}`);
    }
  };

  const handleDashboardNavigate = (tab: TabKey, filter?: string) => {
    setActiveTab(tab);
    setSubFilter(filter);
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Initializing facility interface...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setActiveTab('dashboard');
          fetchDashboard();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header Navbar */}
      <Navbar
        user={currentUser}
        onLogout={handleLogout}
        onRoleSwitch={handleQuickRoleSwitch}
      />

      {/* Role Navigation Tabs */}
      <NavigationTabs
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSubFilter(undefined);
        }}
        role={currentUser.role}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Critical Alerts Banner (Manager & Doctor) */}
        <CriticalAlertBanner
          alert={dashboardSummary?.mortality?.active_alert}
          user={currentUser}
          onAlertAcknowledged={() => fetchDashboard()}
        />

        {/* Unconfirmed Fever Threshold Notice Banner */}
        {dashboardSummary?.fever_threshold && (
          <DemoThresholdBanner
            bannerText={dashboardSummary.fever_threshold.banner}
            isConfigured={dashboardSummary.fever_threshold.is_configured}
            user={currentUser}
            onThresholdUpdated={() => fetchDashboard()}
          />
        )}

        {/* Screen Switcher */}
        {activeTab === 'dashboard' && (
          <RoleDashboard
            summary={dashboardSummary}
            user={currentUser}
            onNavigate={handleDashboardNavigate}
          />
        )}

        {activeTab === 'temperatures' && (
          <NurseTemperatureScreen
            initialFilter={subFilter || 'pending'}
            user={currentUser}
            onReadingLogged={() => fetchDashboard()}
          />
        )}

        {activeTab === 'visits' && (
          <DoctorVisitScreen
            initialGroup={subFilter || 'ready'}
            user={currentUser}
            onVisitLogged={() => fetchDashboard()}
          />
        )}

        {activeTab === 'register' && (
          <PatientRegistrationScreen
            onSuccess={() => fetchDashboard()}
          />
        )}

        {activeTab === 'discharges' && (
          <DischargeScreen
            user={currentUser}
            onDischargeCompleted={() => fetchDashboard()}
          />
        )}

        {activeTab === 'occupancy' && (
          <OccupancyScreen
            user={currentUser}
            onRoomUpdated={() => fetchDashboard()}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsScreen user={currentUser} />
        )}

        {activeTab === 'audit' && (
          <AuditLogScreen />
        )}

        {activeTab === 'users' && (
          <UserManagementScreen />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        Aura Quarantine & Treatment Facility • 74 Isolated Treatment Rooms • Authorized Personnel Only
      </footer>
    </div>
  );
}
