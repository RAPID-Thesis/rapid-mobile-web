import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

/**
 * Consistent page masthead: title, optional breadcrumb trail, supporting count
 * line, and page-level actions. Every route uses this so the eye lands in the
 * same place on every navigation.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  breadcrumbs?: Array<{ label: string; to?: string }>;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-5', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
            {breadcrumbs.map((crumb, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {crumb.to && !last ? (
                    <Link to={crumb.to} className="hover:text-brand-700 hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? 'page' : undefined} className={cn(last && 'text-ink-muted')}>
                      {crumb.label}
                    </span>
                  )}
                  {!last && <span aria-hidden="true">/</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <div className="mt-1 text-sm text-ink-subtle">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
