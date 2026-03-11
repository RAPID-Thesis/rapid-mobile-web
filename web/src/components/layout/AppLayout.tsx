import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { currentUser } from '../../mock/users';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-800">RAPID Portal</h1>
            <p className="text-xs text-slate-500">Pre-EQ and Post-EQ Assessment Workflow</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{currentUser.lguCode}</span>
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-slate-500 hover:text-red-600 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
