import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/cn';
import { IconButton } from '../ui/Button';
import { MenuIcon, CloseIcon } from '../ui/icons';

const COLLAPSE_KEY = 'radar.sidebar.collapsed';

export default function AppLayout() {
  // Collapse preference persists — re-collapsing the sidebar on every page load
  // is a small daily annoyance for an everyday tool.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode — preference simply won't persist */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Desktop rail */}
      <div className="hidden shrink-0 lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      {/* Mobile drawer — the previous layout had no small-screen navigation at
          all, so the portal was effectively desktop-only. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 shadow-overlay">
            <Sidebar
              variant="drawer"
              collapsed={false}
              onToggle={() => undefined}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4',
          )}
        >
          <IconButton
            label={drawerOpen ? 'Close navigation' : 'Open navigation'}
            className="lg:hidden"
            onClick={() => setDrawerOpen((o) => !o)}
          >
            {drawerOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </IconButton>

          {/* Identity on small screens, where the sidebar masthead is hidden. */}
          <div className="flex items-center gap-2 lg:hidden">
            <img src="/brand/cdrrmo-seal.png" alt="" width={24} height={24} className="rounded-full" />
            <span className="text-sm font-semibold text-ink">RADAR</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {profile?.lgu_code && (
              <span className="hidden text-xs text-ink-subtle sm:inline">LGU {profile.lgu_code}</span>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
