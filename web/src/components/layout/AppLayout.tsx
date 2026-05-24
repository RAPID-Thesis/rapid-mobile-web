import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { APP_NAME } from '../../lib/branding';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { profile, signOut } = useAuth();

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-800">{APP_NAME} Portal</h1>
            <p className="text-xs text-slate-500">Pre-EQ and Post-EQ Assessment Workflow</p>
          </div>
          <div className="flex items-center gap-4">
            {profile?.lgu_code && (
              <span className="text-sm text-slate-600">{profile.lgu_code}</span>
            )}
            <button
              onClick={signOut}
              className="text-sm text-slate-500 hover:text-red-600 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
