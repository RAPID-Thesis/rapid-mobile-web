import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { APP_NAME } from '../../lib/branding';
import { cn } from '../../lib/cn';
import {
  AssessmentsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  HeatmapIcon,
  ReportsIcon,
  SettingsIcon,
  SignOutIcon,
  UsersIcon,
} from '../ui/icons';

/**
 * Navigation is grouped by what the user is doing, not by an arbitrary flat
 * list: daily fieldwork lives under Operations, account/system tasks under
 * Administration. The Administration group disappears entirely for non-admins
 * rather than rendering disabled items.
 */
const NAV_GROUPS: Array<{
  heading: string;
  items: Array<{
    to: string;
    label: string;
    icon: typeof DashboardIcon;
    end?: boolean;
    roles?: string[];
  }>;
}> = [
  {
    heading: 'Operations',
    items: [
      { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
      { to: '/assessments', label: 'Assessments', icon: AssessmentsIcon },
      { to: '/heatmap', label: 'Damage map', icon: HeatmapIcon },
      { to: '/reports', label: 'Reports', icon: ReportsIcon },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: UsersIcon, roles: ['admin'] },
      { to: '/admin/settings', label: 'Settings', icon: SettingsIcon, roles: ['admin'] },
    ],
  },
];

export default function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  variant = 'fixed',
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** Called after a nav item is chosen — lets the mobile drawer close itself. */
  onNavigate?: () => void;
  variant?: 'fixed' | 'drawer';
}) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = profile?.full_name || profile?.email || 'User';
  const roleLabel = profile?.role ? profile.role[0].toUpperCase() + profile.role.slice(1) : '';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // In the drawer the sidebar is always full-width; collapsing is desktop-only.
  const isCollapsed = variant === 'fixed' && collapsed;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-brand-900 text-white transition-[width] duration-150',
        isCollapsed ? 'w-16' : 'w-60',
        variant === 'drawer' && 'w-72',
      )}
    >
      {/* Institutional masthead. The CDRRMO seal is the authenticity anchor —
          it belongs to the office that actually operates this tool. */}
      <div
        className={cn(
          'flex items-center gap-2.5 border-b border-white/10 px-3',
          isCollapsed ? 'h-14 justify-center' : 'h-16',
        )}
      >
        <img
          src="/brand/cdrrmo-seal.png"
          srcSet="/brand/cdrrmo-seal.png 1x, /brand/cdrrmo-seal@2x.png 2x"
          alt=""
          width={32}
          height={32}
          className="shrink-0 rounded-full bg-white"
        />
        {!isCollapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-tight">{APP_NAME}</p>
            <p className="truncate text-2xs text-white/60">San Jose del Monte · CDRRMO</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3" aria-label="Main">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(
            (item) => !item.roles || (profile && item.roles.includes(profile.role)),
          );
          if (items.length === 0) return null;

          return (
            <div key={group.heading} className="mb-4 last:mb-0">
              {!isCollapsed && (
                <p className="px-4 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-white/40">
                  {group.heading}
                </p>
              )}
              <ul className="space-y-0.5 px-2">
                {items.map((item) => {
                  const IconCmp = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onNavigate}
                        title={isCollapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          cn(
                            'flex h-9 items-center gap-2.5 rounded-control px-2.5 text-sm transition-colors duration-100',
                            isCollapsed && 'justify-center px-0',
                            isActive
                              ? // A left rule plus a raised surface, rather than a
                                // saturated fill — keeps the nav quiet next to the
                                // status colours in the content area.
                                'bg-white/10 font-medium text-white shadow-[inset_2px_0_0_0_var(--color-brand-500)]'
                              : 'text-white/70 hover:bg-white/5 hover:text-white',
                          )
                        }
                      >
                        <IconCmp className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-2">
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-2.5 rounded-control px-2 py-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-2xs font-semibold"
              >
                {initials}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-xs font-medium">{displayName}</span>
                <span className="block truncate text-2xs text-white/50">{roleLabel}</span>
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="mt-1 flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              <SignOutIcon className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </>
        ) : (
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-9 w-full items-center justify-center rounded-control text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <SignOutIcon className="h-4 w-4" />
          </button>
        )}

        {variant === 'fixed' && (
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="mt-1 flex h-8 w-full items-center justify-center rounded-control text-white/40 transition-colors hover:bg-white/5 hover:text-white"
          >
            {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
          </button>
        )}
      </div>
    </aside>
  );
}
