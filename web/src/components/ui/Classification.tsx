import { cn } from '../../lib/cn';
import {
  REVIEW_THRESHOLD,
  SEVERITY_DOT,
  SEVERITY_MEANING,
  SEVERITY_STYLES,
  severityOf,
} from '../../lib/severity';

/* Presentation for the safety classification. The vocabulary itself (label ->
   severity mapping, palette keys, review threshold) lives in lib/severity.ts so
   that non-component modules can import it without breaking fast refresh. */

export function ClassificationBadge({
  label,
  size = 'md',
  showMeaning = false,
  className,
}: {
  label: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showMeaning?: boolean;
  className?: string;
}) {
  const severity = severityOf(label);
  const text = label ? label.toUpperCase() : 'UNCLASSIFIED';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-control border font-semibold uppercase tracking-wide',
        size === 'sm' && 'px-1.5 py-0.5 text-2xs',
        size === 'md' && 'px-2 py-1 text-xs',
        size === 'lg' && 'px-3 py-1.5 text-sm',
        SEVERITY_STYLES[severity],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', SEVERITY_DOT[severity])} aria-hidden="true" />
      {text}
      {showMeaning && (
        <span className="font-normal normal-case tracking-normal opacity-80">
          · {SEVERITY_MEANING[severity]}
        </span>
      )}
    </span>
  );
}

/** Compact leading indicator for dense table rows. */
export function SeverityDot({ label, className }: { label: string | null | undefined; className?: string }) {
  const severity = severityOf(label);
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[severity], className)}
      // The dot repeats information already in the row's text label.
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Confidence readout.
 *
 * Shown as a number with a proportional bar, never a bare bar: a bar alone
 * implies a precision the model does not have. Below REVIEW_THRESHOLD the whole
 * component switches to an "unresolved" treatment so weak predictions read as
 * open questions rather than quiet answers.
 */
export function ConfidenceMeter({
  value,
  label,
  className,
}: {
  value: number | null | undefined;
  /** Classification this confidence belongs to — colours the bar to match. */
  label?: string | null;
  className?: string;
}) {
  if (value == null || Number.isNaN(value)) {
    return <span className="text-xs text-ink-subtle">No confidence recorded</span>;
  }

  const pct = Math.round(value * 100);
  const weak = value < REVIEW_THRESHOLD;
  const severity = severityOf(label);
  const barColor = weak ? 'bg-line-strong' : SEVERITY_DOT[severity];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`Model confidence ${pct} percent`}
      >
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('tabular text-xs font-medium', weak ? 'text-ink-subtle' : 'text-ink-muted')}>
        {pct}%
      </span>
      {weak && (
        <span className="rounded-control border border-restricted-line bg-restricted-bg px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-restricted">
          Needs review
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Where the prediction came from.
 *
 * `device-offline-heuristic` means the on-device ML models were unavailable and
 * a rule-based fallback ran instead — materially less trustworthy. It was
 * previously plain grey text in three places and easy to miss entirely.
 */
export function PredictionSourceBadge({
  source,
  className,
}: {
  source: string | null | undefined;
  className?: string;
}) {
  if (!source) return null;

  const heuristic = source.includes('heuristic');
  const server = source.includes('server') || source.includes('fusion-server');

  const text = heuristic ? 'Offline estimate' : server ? 'Server model' : 'On-device model';
  const help = heuristic
    ? 'Rule-based fallback — the ML models were unavailable on the device. Treat as provisional.'
    : server ? 'Full ResNet50 + Random Forest fusion, computed server-side.'
      : 'Full ResNet50 + Random Forest fusion, computed on the device.';

  return (
    <span
      title={help}
      className={cn(
        'inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5 text-2xs font-medium',
        heuristic
          ? 'border-restricted-line bg-restricted-bg text-restricted'
          : 'border-brand-200 bg-brand-100 text-brand-700',
        className,
      )}
    >
      {heuristic && (
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {text}
    </span>
  );
}
