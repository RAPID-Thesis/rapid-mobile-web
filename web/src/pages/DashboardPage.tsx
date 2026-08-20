import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatPercent } from '../lib/formatPercent';
import { cn } from '../lib/cn';
import {
  isRestricted,
  isUnsafe,
  triageCounts,
  useAssessmentData,
} from '../lib/useAssessmentData';
import {
  Card,
  CardHeader,
  ClassificationBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  SeverityDot,
  SkeletonCards,
  SkeletonRows,
  StatusBadge,
} from '../components/ui';
import { InboxIcon } from '../components/ui/icons';

/**
 * Triage tile.
 *
 * Replaces the previous four emoji stat cards. Those weighted every number
 * equally — "Total Assessments" looked exactly as urgent as "High Risk" — and
 * an emoji at 20% opacity is decoration, not information. Here the count that
 * demands action is the loud one, and each tile is a link into the filtered
 * worklist rather than a dead readout.
 */
function TriageTile({
  label,
  meaning,
  count,
  tone,
  to,
}: {
  label: string;
  meaning: string;
  count: number;
  tone: 'unsafe' | 'restricted' | 'review' | 'neutral';
  to: string;
}) {
  const accent = {
    unsafe: 'text-unsafe',
    restricted: 'text-restricted',
    review: 'text-brand-700',
    neutral: 'text-ink',
  }[tone];

  const rule = {
    unsafe: 'bg-unsafe',
    restricted: 'bg-restricted',
    review: 'bg-brand-700',
    neutral: 'bg-line-strong',
  }[tone];

  return (
    <Link
      to={to}
      className="group relative flex items-baseline gap-3 overflow-hidden rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', rule)} aria-hidden="true" />
      <span className={cn('tabular text-2xl font-semibold tracking-tight', accent)}>{count}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink">{label}</span>
        <span className="block truncate text-2xs text-ink-subtle">{meaning}</span>
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { assessments, buildingById, loading, error, reload } = useAssessmentData();

  const counts = useMemo(() => triageCounts(assessments), [assessments]);

  // Most urgent first, then most recent — the queue an engineer should work.
  const priority = useMemo(() => {
    const rank = (a: (typeof assessments)[number]) =>
      isUnsafe(a.ai_fused_label) ? 0 : isRestricted(a.ai_fused_label) ? 1 : 2;
    return [...assessments]
      .filter((a) => a.status === 'pending-review' || isUnsafe(a.ai_fused_label))
      .sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at))
      .slice(0, 8);
  }, [assessments]);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState
          title="Could not load assessments"
          message={error}
          onRetry={reload}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Structural screening for San Jose del Monte, Bulacan."
      />

      {loading ? (
        <SkeletonCards count={4} className="mb-6 sm:grid-cols-2 lg:grid-cols-4" />
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TriageTile
            label="Unsafe"
            meaning="Do not enter"
            count={counts.unsafe}
            tone="unsafe"
            to="/assessments?class=unsafe"
          />
          <TriageTile
            label="Restricted"
            meaning="Limited entry"
            count={counts.restricted}
            tone="restricted"
            to="/assessments?class=restricted"
          />
          <TriageTile
            label="Awaiting review"
            meaning="Needs an engineer"
            count={counts.awaitingReview}
            tone="review"
            to="/assessments?status=pending-review"
          />
          <TriageTile
            label="Total recorded"
            meaning={`${counts.reviewed} reviewed`}
            count={counts.total}
            tone="neutral"
            to="/assessments"
          />
        </div>
      )}

      <Card>
        <CardHeader
          title="Needs attention"
          description="Unsafe classifications and anything still awaiting engineer review."
          actions={
            <Link to="/assessments" className="text-xs font-medium text-brand-700 hover:underline">
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
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Assessments needing attention</caption>
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-ink-subtle">
                  <th scope="col" className="px-4 py-2 font-medium">Building</th>
                  <th scope="col" className="px-4 py-2 font-medium">Phase</th>
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
                            <p className="font-medium text-ink">{building?.building_code ?? '—'}</p>
                            <p className="truncate text-2xs text-ink-subtle">
                              {building?.barangay ?? building?.address ?? 'Location not recorded'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-muted">
                        {a.phase === 'pre-earthquake' ? 'Pre-quake' : 'Post-quake'}
                      </td>
                      <td className="px-4 py-2.5">
                        <ClassificationBadge label={a.ai_fused_label} size="sm" />
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
    </>
  );
}
