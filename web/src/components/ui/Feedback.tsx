import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

/* ============================================================================
   Loading / empty / error states
   ----------------------------------------------------------------------------
   Dashboard, Assessments, Heatmap and Reports previously had no error branch at
   all: a failed Supabase query rendered as an empty page, which reads as "no
   damage recorded" in a disaster-response tool. That failure mode is the reason
   ErrorState exists and why every data page must use it.
   ========================================================================= */

type AlertTone = 'info' | 'warn' | 'danger' | 'ok';

const ALERT_TONES: Record<AlertTone, string> = {
  info: 'border-brand-200 bg-info-bg text-brand-800',
  warn: 'border-restricted-line bg-warn-bg text-restricted',
  danger: 'border-unsafe-line bg-danger-bg text-danger',
  ok: 'border-safe-line bg-ok-bg text-safe',
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      // Errors and warnings need to reach assistive tech when injected late.
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-card border px-3 py-2.5 text-sm', ALERT_TONES[tone], className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title ? 'mt-0.5' : null, 'text-xs opacity-90')}>{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-line-strong">{icon}</div>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Shown when data could not be loaded. Always offers a retry — an error the
 * user cannot act on is just a dead end.
 */
export function ErrorState({
  title = 'Could not load this data',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-unsafe-line bg-danger-bg px-6 py-10 text-center',
        className,
      )}
    >
      <svg className="mb-3 h-6 w-6 text-danger" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <p className="text-sm font-semibold text-danger">{title}</p>
      {message && <p className="mt-1 max-w-md text-xs text-danger/80">{message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* -- Skeletons ---------------------------------------------------------------
   Shaped like the content they replace, so the layout does not jump when data
   arrives. A generic centred spinner tells the user nothing about what is
   coming. */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-line', className)} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-line', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="ml-auto h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-card border border-line bg-surface p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-16" />
        </div>
      ))}
    </div>
  );
}
