import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatPercent } from '../lib/formatPercent';
import { cn } from '../lib/cn';
import { isRestricted, isUnsafe, useAssessmentData } from '../lib/useAssessmentData';
import type { Assessment, AssessmentPhase, AssessmentStatus, Building } from '../types';
import {
  Button,
  Card,
  ClassificationBadge,
  ConfidenceMeter,
  EmptyState,
  ErrorState,
  PageHeader,
  PhaseBadge,
  SearchInput,
  Select,
  SeverityDot,
  SkeletonRows,
  StatusBadge,
} from '../components/ui';
import { InboxIcon } from '../components/ui/icons';

/** Filters live in the URL so a filtered worklist can be linked to and shared. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  return {
    q: params.get('q') ?? '',
    phase: (params.get('phase') ?? '') as AssessmentPhase | '',
    status: (params.get('status') ?? '') as AssessmentStatus | '',
    klass: params.get('class') ?? '',
    sort: params.get('sort') === 'priority' ? 'priority' : 'date',
    set,
    clearAll: () => setParams(new URLSearchParams(), { replace: true }),
    activeCount: ['q', 'phase', 'status', 'class'].filter((k) => params.get(k)).length,
  };
}

/**
 * The two phases score the same severity under different vocabularies: FEMA P-154
 * says low/moderate/high, ATC-20 says SAFE/RESTRICTED/UNSAFE. The filter itself is
 * severity-keyed and works for both, so only the wording follows the phase — with
 * both spellings shown when no phase is chosen.
 */
function classificationNames(phase: AssessmentPhase | ''): Record<
  'safe' | 'restricted' | 'unsafe',
  string
> {
  if (phase === 'pre-earthquake') {
    return { safe: 'Low', restricted: 'Moderate', unsafe: 'High' };
  }
  if (phase === 'post-earthquake') {
    return { safe: 'Safe', restricted: 'Restricted', unsafe: 'Unsafe' };
  }
  return {
    safe: 'Low / Safe',
    restricted: 'Moderate / Restricted',
    unsafe: 'High / Unsafe',
  };
}

export default function AssessmentsPage() {
  const navigate = useNavigate();
  const { assessments, buildingById, loading, error, reload } = useAssessmentData();
  const f = useFilters();
  const classNames = classificationNames(f.phase);

  const filtered = useMemo(() => {
    let result = [...assessments];

    if (f.phase) result = result.filter((a) => a.phase === f.phase);
    if (f.status) result = result.filter((a) => a.status === f.status);
    if (f.klass === 'unsafe') result = result.filter((a) => isUnsafe(a.ai_fused_label));
    if (f.klass === 'restricted') result = result.filter((a) => isRestricted(a.ai_fused_label));
    if (f.klass === 'safe')
      result = result.filter(
        (a) => a.ai_fused_label && !isUnsafe(a.ai_fused_label) && !isRestricted(a.ai_fused_label),
      );

    if (f.q) {
      const q = f.q.toLowerCase();
      result = result.filter((a) => {
        const b = buildingById.get(a.building_id);
        return (
          b?.building_code.toLowerCase().includes(q) ||
          b?.address.toLowerCase().includes(q) ||
          b?.barangay.toLowerCase().includes(q)
        );
      });
    }

    result.sort((a, b) =>
      f.sort === 'priority'
        ? b.priority_score - a.priority_score
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return result;
  }, [assessments, buildingById, f.phase, f.status, f.klass, f.q, f.sort]);

  const open = (id: string) => navigate(`/assessments/${id}`);

  if (error) {
    return (
      <>
        <PageHeader title="Assessments" />
        <ErrorState title="Could not load assessments" message={error} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Assessments"
        description={
          loading
            ? 'Loading…'
            : `${filtered.length} of ${assessments.length} record${assessments.length === 1 ? '' : 's'}`
        }
      />

      {/* Filter bar */}
      <Card className="mb-3">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput
            className="w-full sm:w-64"
            placeholder="Code, address or barangay…"
            aria-label="Search assessments"
            value={f.q}
            onChange={(e) => f.set('q', e.target.value)}
          />
          <Select
            className="w-auto"
            aria-label="Filter by phase"
            value={f.phase}
            onChange={(e) => f.set('phase', e.target.value)}
          >
            <option value="">All phases</option>
            <option value="pre-earthquake">Pre-earthquake</option>
            <option value="post-earthquake">Post-earthquake</option>
          </Select>
          <Select
            className="w-auto"
            aria-label="Filter by classification"
            value={f.klass}
            onChange={(e) => f.set('class', e.target.value)}
          >
            <option value="">All classifications</option>
            <option value="unsafe">{classNames.unsafe}</option>
            <option value="restricted">{classNames.restricted}</option>
            <option value="safe">{classNames.safe}</option>
          </Select>
          <Select
            className="w-auto"
            aria-label="Filter by status"
            value={f.status}
            onChange={(e) => f.set('status', e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending-sync">Pending sync</option>
            <option value="pending-review">Awaiting review</option>
            <option value="reviewed">Reviewed</option>
            <option value="report-generated">Report issued</option>
          </Select>
          <Select
            className="ml-auto w-auto"
            aria-label="Sort order"
            value={f.sort}
            onChange={(e) => f.set('sort', e.target.value)}
          >
            <option value="date">Newest first</option>
            <option value="priority">Highest priority</option>
          </Select>
          {f.activeCount > 0 && (
            <Button size="sm" variant="ghost" onClick={f.clearAll}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <SkeletonRows rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="h-8 w-8" />}
            // "No results for your filter" and "no data at all" need different
            // next actions; the old page showed the same message for both.
            title={assessments.length === 0 ? 'No assessments yet' : 'No matching assessments'}
            description={
              assessments.length === 0
                ? 'Records submitted from the mobile app appear here once they sync.'
                : 'Try widening or clearing the filters.'
            }
            action={
              assessments.length > 0 && f.activeCount > 0 ? (
                <Button size="sm" variant="secondary" onClick={f.clearAll}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop worklist */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">Assessment worklist</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-raised text-left text-2xs uppercase tracking-wider text-ink-subtle">
                    <th scope="col" className="px-4 py-2 font-medium">Building</th>
                    <th scope="col" className="px-4 py-2 font-medium">Barangay</th>
                    <th scope="col" className="px-4 py-2 font-medium">Phase</th>
                    <th scope="col" className="px-4 py-2 font-medium">Classification</th>
                    <th scope="col" className="px-4 py-2 font-medium">Model confidence</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Priority</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((a) => (
                    <Row key={a.id} a={a} building={buildingById.get(a.building_id)} onOpen={open} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards — a horizontally scrolling 8-column table is unusable
                on a phone, and DRRMO staff do check this in the field. */}
            <ul className="divide-y divide-line md:hidden">
              {filtered.map((a) => {
                const b = buildingById.get(a.building_id);
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => open(a.id)}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-raised"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{b?.building_code ?? '—'}</p>
                          <p className="truncate text-xs text-ink-subtle">
                            {b?.barangay ?? b?.address ?? 'Location not recorded'}
                          </p>
                        </div>
                        <ClassificationBadge label={a.ai_fused_label} size="sm" />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <PhaseBadge phase={a.phase} />
                        <StatusBadge status={a.status} />
                        <span className="tabular ml-auto text-2xs text-ink-subtle">
                          {new Date(a.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}

function Row({
  a,
  building,
  onOpen,
}: {
  a: Assessment;
  building: Building | undefined;
  onOpen: (id: string) => void;
}) {
  return (
    <tr
      tabIndex={0}
      role="link"
      onClick={() => onOpen(a.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(a.id);
        }
      }}
      className="cursor-pointer transition-colors hover:bg-surface-raised focus:bg-surface-raised"
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <SeverityDot label={a.ai_fused_label} />
          <div className="min-w-0">
            <p className="font-medium text-ink">{building?.building_code ?? '—'}</p>
            <p className="max-w-[220px] truncate text-2xs text-ink-subtle">{building?.address}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 text-xs text-ink-muted">{building?.barangay ?? '—'}</td>
      <td className="px-4 py-2.5">
        <PhaseBadge phase={a.phase} />
      </td>
      <td className="px-4 py-2.5">
        <ClassificationBadge label={a.ai_fused_label} size="sm" />
      </td>
      <td className="px-4 py-2.5">
        <ConfidenceMeter value={a.ai_fused_confidence} label={a.ai_fused_label} />
      </td>
      <td
        className={cn(
          'tabular px-4 py-2.5 text-right text-xs font-medium',
          a.priority_score >= 0.8
            ? 'text-unsafe'
            : a.priority_score >= 0.5
              ? 'text-restricted'
              : 'text-ink-muted',
        )}
      >
        {formatPercent(a.priority_score, 0)}
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge status={a.status} />
      </td>
      <td className="tabular px-4 py-2.5 text-right text-2xs text-ink-subtle">
        {new Date(a.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
}
