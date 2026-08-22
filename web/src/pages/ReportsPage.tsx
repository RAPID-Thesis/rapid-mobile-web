import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { downloadAssessmentReport } from '../lib/assessmentReport';
import { cn } from '../lib/cn';
import type { Assessment, AssessmentPhase, Building } from '../types';
import {
  Button,
  Card,
  ClassificationBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  PhaseBadge,
  SkeletonRows,
} from '../components/ui';
import { ReportsIcon } from '../components/ui/icons';

type PhaseFilter = AssessmentPhase | 'all';

const PHASE_TABS: { value: PhaseFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pre-earthquake', label: 'Pre-earthquake' },
  { value: 'post-earthquake', label: 'Post-earthquake' },
];

export default function ReportsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // Distinct from useAssessmentData: this view is scoped to reviewed rows.
      const [aRes, bRes] = await Promise.all([
        supabase
          .from('assessments')
          .select('*')
          .in('status', ['reviewed', 'report-generated'])
          .order('created_at', { ascending: false }),
        supabase.from('buildings').select('*'),
      ]);
      if (cancelled) return;

      const failure = aRes.error ?? bRes.error;
      if (failure) {
        setError(failure.message);
      } else {
        setAssessments((aRes.data as Assessment[]) ?? []);
        setBuildings((bRes.data as Building[]) ?? []);
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const phase = (params.get('phase') as PhaseFilter | null) ?? 'all';
  const setPhase = (next: PhaseFilter) => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('phase');
    else p.set('phase', next);
    setParams(p, { replace: true });
  };

  const visible = useMemo(
    () => (phase === 'all' ? assessments : assessments.filter((a) => a.phase === phase)),
    [assessments, phase],
  );

  async function handlePdf(assessment: Assessment, building: Building | undefined) {
    await downloadAssessmentReport(assessment, building ?? null);
    if (assessment.status === 'reviewed') {
      await supabase.from('assessments').update({ status: 'report-generated' }).eq('id', assessment.id);
      setAssessments((prev) =>
        prev.map((a) => (a.id === assessment.id ? { ...a, status: 'report-generated' as const } : a)),
      );
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Reports" />
        <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          loading
            ? 'Loading…'
            : `${visible.length} reviewed assessment${visible.length === 1 ? '' : 's'} ready to issue`
        }
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

      <Card className="mb-3">
        <p className="px-4 py-3 text-xs text-ink-muted">
          Reviewed assessments download as a FEMA P-154 / ATC-20 record in{' '}
          <span className="font-medium text-ink">PDF</span> format. The first export marks the
          record as issued.
        </p>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : visible.length === 0 ? (
          // A phase with nothing in it is a different situation from having no
          // reviewed work at all, so don't tell the user to go review something
          // when the other phase is already full of issued records.
          assessments.length > 0 ? (
            <EmptyState
              icon={<ReportsIcon className="h-8 w-8" />}
              title="No reports for this phase"
              description="No reviewed assessments have been recorded for the selected phase yet."
              action={
                <Button size="sm" variant="secondary" onClick={() => setPhase('all')}>
                  Show all phases
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ReportsIcon className="h-8 w-8" />}
              title="No reports ready"
              description="A report becomes available once an engineer has reviewed the assessment."
              action={
                <Button size="sm" variant="secondary" onClick={() => navigate('/assessments?status=pending-review')}>
                  View assessments awaiting review
                </Button>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Reviewed assessments available as reports</caption>
              <thead>
                <tr className="border-b border-line bg-surface-raised text-left text-2xs uppercase tracking-wider text-ink-subtle">
                  <th scope="col" className="px-4 py-2 font-medium">Building</th>
                  <th scope="col" className="px-4 py-2 font-medium">Phase</th>
                  <th scope="col" className="px-4 py-2 font-medium">Final classification</th>
                  <th scope="col" className="px-4 py-2 font-medium">Reviewed</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((a) => {
                  const building = buildings.find((b) => b.id === a.building_id);
                  const label = a.override_classification ?? a.ai_fused_label;
                  const issued = a.status === 'report-generated';

                  return (
                    <tr key={a.id} className="transition-colors hover:bg-surface-raised">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink">{building?.building_code ?? '—'}</p>
                        <p className="max-w-[240px] truncate text-2xs text-ink-subtle">
                          {building?.barangay ?? building?.address}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <PhaseBadge phase={a.phase} />
                      </td>
                      <td className="px-4 py-2.5">
                        <ClassificationBadge label={label} phase={a.phase} size="sm" />
                      </td>
                      <td className="tabular px-4 py-2.5 text-xs text-ink-muted">
                        {a.reviewed_at ? new Date(a.reviewed_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant={issued ? 'secondary' : 'primary'}
                            onClick={() => void handlePdf(a, building)}
                          >
                            {issued ? 'Download again' : 'Download PDF'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/assessments/${a.id}`)}>
                            Open
                          </Button>
                        </div>
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
