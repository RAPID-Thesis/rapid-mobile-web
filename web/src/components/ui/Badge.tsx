import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/* Generic badges for non-safety metadata. Safety classification has its own
   component in Classification.tsx and must not be rendered through this one —
   keeping them separate is what stops green/amber/red leaking into decoration. */

type Tone = 'neutral' | 'brand' | 'info' | 'warn' | 'danger' | 'ok';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-raised text-ink-muted border-line',
  brand: 'bg-brand-100 text-brand-700 border-brand-200',
  info: 'bg-info-bg text-info border-brand-200',
  warn: 'bg-warn-bg text-warn border-restricted-line',
  danger: 'bg-danger-bg text-danger border-unsafe-line',
  ok: 'bg-ok-bg text-ok border-safe-line',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -- Domain-specific wrappers ------------------------------------------------
   These replace the four hand-rolled copies of getStatusBadge / getRoleBadge
   that were duplicated across AssessmentsPage, DashboardPage, ReportsPage and
   UsersPage. */

const STATUS_LABELS: Record<string, { text: string; tone: Tone }> = {
  'pending-sync': { text: 'Pending sync', tone: 'neutral' },
  'pending-review': { text: 'Awaiting review', tone: 'warn' },
  reviewed: { text: 'Reviewed', tone: 'ok' },
  'report-generated': { text: 'Report issued', tone: 'brand' },
};

export function StatusBadge({ status, className }: { status: string | null; className?: string }) {
  if (!status) return null;
  const entry = STATUS_LABELS[status] ?? { text: status, tone: 'neutral' as Tone };
  return (
    <Badge tone={entry.tone} className={className}>
      {entry.text}
    </Badge>
  );
}

export function PhaseBadge({ phase, className }: { phase: string | null; className?: string }) {
  if (!phase) return null;
  const post = phase === 'post-earthquake';
  return (
    <Badge tone="neutral" className={className}>
      {post ? 'Post-quake' : 'Pre-quake'}
    </Badge>
  );
}

const ROLE_TONES: Record<string, Tone> = {
  admin: 'brand',
  engineer: 'info',
  drrmo: 'neutral',
  inspector: 'neutral',
};

export function RoleBadge({ role, className }: { role: string | null; className?: string }) {
  if (!role) return null;
  return (
    <Badge tone={ROLE_TONES[role] ?? 'neutral'} className={cn('capitalize', className)}>
      {role}
    </Badge>
  );
}

const VERIFICATION_TONES: Record<string, Tone> = {
  approved: 'ok',
  pending: 'warn',
  rejected: 'danger',
};

export function VerificationBadge({ status, className }: { status: string | null; className?: string }) {
  if (!status) return null;
  return (
    <Badge tone={VERIFICATION_TONES[status] ?? 'neutral'} className={cn('capitalize', className)}>
      {status}
    </Badge>
  );
}
