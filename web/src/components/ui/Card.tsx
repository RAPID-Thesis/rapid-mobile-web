import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Surface primitive. Depth comes from a hairline border by default; `raised` is
 * the only elevated step and is reserved for things that genuinely float above
 * the page. Stacking shadowed cards inside shadowed cards is the fastest way to
 * make an interface look generated.
 */
export function Card({
  children,
  className,
  raised = false,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-line bg-surface',
        raised && 'shadow-raised',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-line px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

/** Label / value row used throughout the detail views. */
export function DataRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5', className)}>
      <dt className="shrink-0 text-xs text-ink-subtle">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{value ?? '—'}</dd>
    </div>
  );
}
