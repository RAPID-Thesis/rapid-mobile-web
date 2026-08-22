import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatPercent } from '../lib/formatPercent';
import { cn } from '../lib/cn';
import {
  isRestricted,
  isUnsafe,
  triageCounts,
  useAssessmentData,
} from '../lib/useAssessmentData';
import type { Assessment, AssessmentPhase } from '../types';
import {
  Card,
  CardHeader,
  ClassificationBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  SeverityDot,
  severityBandLabel,
  SkeletonRows,
  StatusBadge,
} from '../components/ui';
import { InboxIcon } from '../components/ui/icons';

/* ============================================================================
   The dashboard answers one question: what does the office act on right now?

   It is deliberately not a grid of equal-weight stat cards. Those read every
   number as equally urgent — "total recorded" looked exactly as loud as
   "unsafe" — and four identical rounded boxes is the house style of every
   template. Instead: one proportional bar showing the composition of the
   portfolio (the thing a DRRMO wall board would show), then the worklist, then
   where the damage is concentrated.
   ========================================================================= */

type PhaseFilter = AssessmentPhase | 'all';

const PHASE_TABS: { value: PhaseFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pre-earthquake', label: 'Pre-earthquake' },
  { value: 'post-earthquake', label: 'Post-earthquake' },
];

/** Vocabulary follows the framework in play; the underlying severity is the same. */
function bandNames(phase: PhaseFilter): { unsafe: string; restricted: string; safe: string } {
  const p = phase === 'all' ? null : phase;
  return {
    unsafe: severityBandLabel('unsafe', p),
    restricted: severityBandLabel('restricted', p),
    safe: severityBandLabel('safe', p),
  };
}

interface Band {
  key: string;
  label: string;
  count: number;
  bar: string;
  text: string;
  to: string;
}

/**
 * One bar, segmented by severity, sized by share of the portfolio. The eye reads
 * proportion before it reads any number, which is the point: a wide red segment
 * is the finding.
 */
function PortfolioBar({ bands, total }: { bands: Band[]; total: number }) {
  return (
    <div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={bands.map((b) => `${b.label}: ${b.count}`).join(', ')}
      >
        {bands.map((b) =>
          b.count === 0 ? null : (
            <div
              key={b.key}
              className={b.bar}
              style={{ width: `${(b.count / Math.max(total, 1)) * 100}%` }}
            />
          ),
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {bands.map((b) => (
          <Link
            key={b.key}
            to={b.to}
            className="group flex items-baseline gap-2 rounded-control px-1 -mx-1 transition-colors hover:bg-surface-raised"
          >
            <dd className={cn('tabular text-xl font-semibold tracking-tight', b.text)}>
              {b.count}
            </dd>
            <dt className="text-xs text-ink-muted group-hover:text-ink">{b.label}</dt>
          </Link>
        ))}
      </dl>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { assessments, buildingById, loading, error, reload } = useAssessmentData();

  const phase = (params.get('phase') as PhaseFilter | null) ?? 'all';
  const setPhase = (next: PhaseFilter) => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('phase');
    else p.set('phase', next);
    setParams(p, { replace: true });
  };

  const scoped = useMemo(
    () => (phase === 'all' ? assessments : assessments.filter((a) => a.phase === phase)),
    [assessments, phase],
  );

  const counts = useMemo(() => triageCounts(scoped), [scoped]);
  const names = bandNames(phase);
  const phaseQuery = phase === 'all' ? '' : `&phase=${phase}`;

  const bands: Band[] = [
    {
      key: 'unsafe',
      label: names.unsafe,
      count: counts.unsafe,
      bar: 'bg-unsafe',
      text: 'text-unsafe',
      to: `/assessments?class=unsafe${phaseQuery}`,
    },
    {
      key: 'restricted',
      label: names.restricted,
      count: counts.restricted,
      bar: 'bg-restricted',
      text: 'text-restricted',
      to: `/assessments?class=restricted${phaseQuery}`,
    },
    {
      key: 'safe',
      label: names.safe,
      count: counts.total - counts.unsafe - counts.restricted - counts.unclassified,
      bar: 'bg-safe',
      text: 'text-safe',
      to: `/assessments?class=safe${phaseQuery}`,
    },
    {
      key: 'unclassified',
      label: 'Unclassified',
      count: counts.unclassified,
      bar: 'bg-line-strong',
      text: 'text-ink-subtle',
      to: `/assessments${phaseQuery ? `?${phaseQuery.slice(1)}` : ''}`,
    },
  ];

  // Most urgent first, then most recent — the queue an engineer should work.
  const priority = useMemo(() => {
    const rank = (a: Assessment) =>
      isUnsafe(a.ai_fused_label) ? 0 : isRestricted(a.ai_fused_label) ? 1 : 2;
    return [...scoped]
      .filter((a) => a.status === 'pending-review' || isUnsafe(a.ai_fused_label))
      .sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at))
      .slice(0, 8);
  }, [scoped]);

  /** Where damage concentrates — the operational question after "how many". */
  const byBarangay = useMemo(() => {
    const map = new Map<string, { total: number; unsafe: number; restricted: number }>();
    for (const a of scoped) {
      const name = buildingById.get(a.building_id)?.barangay?.trim();
      if (!name) continue;
      const row = map.get(name) ?? { total: 0, unsafe: 0, restricted: 0 };
      row.total += 1;
      if (isUnsafe(a.ai_fused_label)) row.unsafe += 1;
      else if (isRestricted(a.ai_fused_label)) row.restricted += 1;
      map.set(name, row);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.unsafe - a.unsafe || b.restricted - a.restricted || b.total - a.total)
      .slice(0, 6);
  }, [scoped, buildingById]);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState title="Could not load assessments" message={error} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Structural screening for San Jose del Monte, Bulacan."
        actions={
          <div
            className="inline-flex rounded-control border border-line-strong bg-surface p-0.5"
            role="tablist"
            aria-label="Filter by assessment phase"
          >
            {PHASE_TABS.map((t) => {
              const active = phase === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPhase(t.value)}
                  className={cn(
                    'rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-brand-700 text-white'
                      : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        }
      />

      {/* Portfolio composition */}
      <Card className="mb-4">
        <CardHeader
          title={
            phase === 'all'
              ? 'All assessments'
              : phase === 'pre-earthquake'
                ? 'Pre-earthquake screening · FEMA P-154'
                : 'Post-earthquake evaluation · ATC-20'
          }
          description={
            loading
              ? 'Loading…'
              : `${counts.total} record${counts.total === 1 ? '' : 's'} · ${counts.awaitingReview} awaiting engineer review`
          }
          actions={
            counts.awaitingReview > 0 ? (
              <Link
                to={`/assessments?status=pending-review${phaseQuery}`}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Review queue →
              </Link>
            ) : null
          }
        />
        <div className="px-4 pb-4">
          {loading ? (
            <div className="h-2.5 w-full animate-pulse rounded-full bg-line" />
          ) : counts.total === 0 ? (
            <p className="text-xs text-ink-subtle">
              No assessments recorded for this phase yet.
            </p>
          ) : (
            <PortfolioBar bands={bands} total={counts.total} />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Worklist */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Needs attention"
            description="Unsafe classifications and anything still awaiting engineer review."
            actions={
              <Link
                to={`/assessments${phaseQuery ? `?${phaseQuery.slice(1)}` : ''}`}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                View all
              </Link>
            }
          />

          {loading ? (
            <SkeletonRows rows={5} />
          ) : priority.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="h-8 w-8" />}
              title={counts.total === 0 ? 'No assessments yet' : 'Nothing needs attention'}
              description={
                counts.total === 0
                  ? 'Assessments submitted from the mobile app will appear here once they sync.'
                  : 'Every assessment has been reviewed and none are classified unsafe.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Assessments needing attention</caption>
                <thead>
                  <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-ink-subtle">
                    <th scope="col" className="px-4 py-2 font-medium">Building</th>
                    <th scope="col" className="px-4 py-2 font-medium">Classification</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Priority</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {priority.map((a) => {
                    const building = buildingById.get(a.building_id);
                    return (
                      <tr
                        key={a.id}
                        tabIndex={0}
                        role="link"
                        onClick={() => navigate(`/assessments/${a.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/assessments/${a.id}`);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-surface-raised focus:bg-surface-raised"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <SeverityDot label={a.ai_fused_label} />
                            <div className="min-w-0">
                              <p className="font-medium text-ink">
                                {building?.building_code ?? '—'}
                              </p>
                              <p className="truncate text-2xs text-ink-subtle">
                                {building?.barangay ?? building?.address ?? 'Location not recorded'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <ClassificationBadge label={a.ai_fused_label} phase={a.phase} size="sm" />
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-xs font-medium text-ink-muted">
                          {formatPercent(a.priority_score, 0)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-2xs text-ink-subtle">
                          {new Date(a.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Geographic concentration */}
        <Card>
          <CardHeader
            title="Most affected barangays"
            description="Ranked by unsafe count."
            actions={
              <Link to="/heatmap" className="text-xs font-medium text-brand-700 hover:underline">
                Map
              </Link>
            }
          />
          {loading ? (
            <SkeletonRows rows={5} />
          ) : byBarangay.length === 0 ? (
            <div className="px-4 pb-4">
              <p className="text-xs text-ink-subtle">No barangay data recorded yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {byBarangay.map((b) => (
                <li key={b.name} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs font-medium text-ink">{b.name}</span>
                    <span className="tabular shrink-0 text-2xs text-ink-subtle">
                      {b.total} record{b.total === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="bg-unsafe"
                      style={{ width: `${(b.unsafe / b.total) * 100}%` }}
                    />
                    <div
                      className="bg-restricted"
                      style={{ width: `${(b.restricted / b.total) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-2xs text-ink-subtle">
                    <span className="font-medium text-unsafe">{b.unsafe}</span> {names.unsafe} ·{' '}
                    <span className="font-medium text-restricted">{b.restricted}</span>{' '}
                    {names.restricted}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
