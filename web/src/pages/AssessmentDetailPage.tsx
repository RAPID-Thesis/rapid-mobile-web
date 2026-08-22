import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { signedUrlsForImages } from '../lib/signedImageUrls';
import { downloadAssessmentReport } from '../lib/assessmentReport';
import { useAuth } from '../context/AuthContext';
import { formatPercent } from '../lib/formatPercent';
import { explainAssessment, type Driver } from '../lib/explainAssessment';
import { cn } from '../lib/cn';
import type { Assessment, AssessmentImage, Building } from '../types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ClassificationBadge,
  DataRow,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  PhaseBadge,
  REVIEW_THRESHOLD,
  Select,
  SEVERITY_MEANING,
  severityOf,
  displayLabel,
  Skeleton,
  StatusBadge,
  Textarea,
} from '../components/ui';

/* -------------------------------------------------------------------------- */

/** One reason, marked by whether it pushed severity up or down. */
function DriverRow({ driver }: { driver: Driver }) {
  const mark = {
    raises: { glyph: '▲', tone: 'text-unsafe', label: 'increases severity' },
    lowers: { glyph: '▼', tone: 'text-safe', label: 'decreases severity' },
    neutral: { glyph: '■', tone: 'text-ink-subtle', label: 'neutral factor' },
  }[driver.direction];

  return (
    <li className="flex gap-2.5 py-1.5">
      <span className={cn('mt-0.5 text-2xs leading-none', mark.tone)} aria-hidden="true">
        {mark.glyph}
      </span>
      <span className="sr-only">{mark.label}:</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink">{driver.label}</p>
        <p className="text-2xs text-ink-muted">{driver.detail}</p>
      </div>
    </li>
  );
}

/** Horizontal probability row used for the per-branch model breakdown. */
/**
 * Turn a Random Forest feature name into something an inspector reads without
 * knowing what a one-hot encoding is: `cat__soil_classification_E` becomes
 * "Soil type E", `num__distance_to_fault_km` becomes "Distance to fault line".
 */
const FEATURE_LABELS: Record<string, string> = {
  year_built: 'Year built',
  building_age: 'Age of building',
  number_of_stories: 'Number of storeys',
  distance_to_fault_km: 'Distance to fault line',
  elevation_m: 'Ground elevation',
  slope_deg: 'Ground slope',
  previous_retrofit_as_int: 'Previously retrofitted',
  building_use: 'Building use',
  soil_classification: 'Soil type',
  structural_system: 'Structural system',
  foundation_type: 'Foundation type',
  material: 'Construction material',
};

function featureName(raw: string): string {
  const bare = raw.replace(/^num__/, '').replace(/^cat__/, '');
  if (FEATURE_LABELS[bare]) return FEATURE_LABELS[bare];

  // Categorical features arrive one-hot encoded as `<feature>_<category>`, so
  // peel category values off the end until the remainder is a known feature.
  const parts = bare.split('_');
  for (let cut = parts.length - 1; cut > 0; cut--) {
    const head = parts.slice(0, cut).join('_');
    if (FEATURE_LABELS[head]) {
      const value = parts.slice(cut).join(' ').replace(/-/g, ' ');
      return `${FEATURE_LABELS[head]}: ${value}`;
    }
  }
  return bare.replace(/_/g, ' ');
}

function ProbabilityRow({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  const severity = severityOf(label);
  const fill = {
    safe: 'bg-safe',
    restricted: 'bg-restricted',
    unsafe: 'bg-unsafe',
    unknown: 'bg-brand-500',
  }[severity];

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-32 shrink-0 truncate text-2xs text-ink-muted" title={label}>
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className={cn('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-12 shrink-0 text-right text-2xs font-medium text-ink-muted">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

/**
 * Read a field the inspector recorded, trying each spelling in turn.
 *
 * The buildings table has columns for soil class and fault distance, but the
 * sync endpoint never writes them -- it only sets the identity/location fields
 * when it first creates a building row. The values the inspector actually
 * captured live in the assessment's `structural_data` blob, which is where the
 * mobile app reads them from, so the portal reads the same place rather than
 * showing an em dash next to data it holds.
 */
function fieldValue(data: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = data[key];
    if (v == null) continue;
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
    const text = String(v).trim();
    if (text && text !== '—') return text;
  }
  return null;
}

function StructuralData({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(([k]) => k !== '__proto__');

  return (
    <Card>
      <CardHeader title="Field form" description="Structural data recorded by the inspector." />
      {entries.length === 0 ? (
        <CardBody>
          <p className="text-xs text-ink-subtle">No structured fields recorded for this assessment.</p>
        </CardBody>
      ) : (
        <CardBody className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2">
          {entries.map(([key, value]) => (
            <DataRow
              key={key}
              label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              value={
                <span className="break-words">
                  {typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value ?? '—')}
                </span>
              }
              className="border-b border-line last:border-0 sm:[&:nth-last-child(2)]:border-0"
            />
          ))}
        </CardBody>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrideClass, setOverrideClass] = useState('');
  const [justification, setJustification] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [lightbox, setLightbox] = useState<AssessmentImage | null>(null);

  const canSubmitReview = profile?.role === 'engineer' || profile?.role === 'admin';

  const loadAssessment = useCallback(async () => {
    if (!id) return;
    // The previous version discarded the query error and treated any failure as
    // "not found", which hid outages behind a 404-style message.
    const { data: aData, error: aError } = await supabase
      .from('assessments')
      .select('*, assessment_images(*)')
      .eq('id', id)
      .single();

    if (aError) {
      setLoadError(aError.message);
      setAssessment(null);
      return;
    }

    if (aData) {
      setLoadError(null);
      const a = { ...aData, images: aData.assessment_images ?? [] } as Assessment;
      setAssessment(a);
      const urls = await signedUrlsForImages(a.images ?? []);
      setImageUrls(urls);

      const { data: bData } = await supabase
        .from('buildings')
        .select('*')
        .eq('id', a.building_id)
        .single();
      setBuilding(bData as Building | null);
    } else {
      setAssessment(null);
      setBuilding(null);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadAssessment();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAssessment]);

  async function handleSubmitReview() {
    if (!assessment || !profile?.id) return;
    setReviewError('');
    if (overrideClass && !justification.trim()) {
      setReviewError('A justification is required when overriding the AI classification.');
      return;
    }
    setReviewSubmitting(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('assessments')
        .update({
          reviewed_by: profile.id,
          reviewed_at: now,
          override_classification: overrideClass || null,
          review_justification: overrideClass ? justification.trim() : null,
          status: 'reviewed',
        })
        .eq('id', assessment.id);

      if (error) throw error;
      setOverrideClass('');
      setJustification('');
      await loadAssessment();
    } catch (e: unknown) {
      setReviewError(e instanceof Error ? e.message : 'Could not save review.');
    } finally {
      setReviewSubmitting(false);
    }
  }

  /* -- states ------------------------------------------------------------- */

  if (loading) {
    return (
      <>
        <PageHeader title="Assessment" />
        <Skeleton className="mb-4 h-24 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <PageHeader
          title="Assessment"
          breadcrumbs={[{ label: 'Assessments', to: '/assessments' }, { label: 'Detail' }]}
        />
        <ErrorState message={loadError} onRetry={() => void loadAssessment()} />
      </>
    );
  }

  if (!assessment) {
    return (
      <>
        <PageHeader
          title="Assessment not found"
          breadcrumbs={[{ label: 'Assessments', to: '/assessments' }, { label: 'Not found' }]}
        />
        <Card>
          <CardBody className="text-center">
            <p className="text-sm text-ink-muted">
              This assessment may have been deleted, or you may not have access to it.
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => navigate('/assessments')}
            >
              Back to assessments
            </Button>
          </CardBody>
        </Card>
      </>
    );
  }

  /* -- derived ------------------------------------------------------------ */

  const aiLabel = assessment.ai_fused_label;
  const finalLabel = assessment.override_classification ?? assessment.ai_fused_label;
  const severity = severityOf(finalLabel);
  const overridden = Boolean(assessment.override_classification);
  const confidence = assessment.ai_fused_confidence;
  const lowConfidence = confidence != null && confidence < REVIEW_THRESHOLD;
  const structural = (assessment.structural_data ?? {}) as Record<string, unknown>;

  const bandTone = {
    safe: 'border-safe-line bg-safe-bg',
    restricted: 'border-restricted-line bg-restricted-bg',
    unsafe: 'border-unsafe-line bg-unsafe-bg',
    unknown: 'border-line bg-surface-raised',
  }[severity];

  const bandText = {
    safe: 'text-safe',
    restricted: 'text-restricted',
    unsafe: 'text-unsafe',
    unknown: 'text-ink-muted',
  }[severity];

  return (
    <>
      <PageHeader
        title={building?.building_code ?? 'Assessment'}
        description={
          building ? `${building.address}${building.barangay ? ` · ${building.barangay}` : ''}` : undefined
        }
        breadcrumbs={[
          { label: 'Assessments', to: '/assessments' },
          { label: building?.building_code ?? 'Detail' },
        ]}
        actions={
          <>
            <PhaseBadge phase={assessment.phase} />
            <StatusBadge status={assessment.status} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadAssessmentReport(assessment, building)}
            >
              Download PDF
            </Button>
          </>
        }
      />

      {/* Decision band — the answer an engineer opened this page for, stated
          before any supporting detail. Replaces a saturated full-bleed colour
          block that made every page look like an alert. */}
      <div className={cn('mb-4 rounded-card border p-4', bandTone)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xs font-medium uppercase tracking-wider text-ink-subtle">
              {overridden ? 'Final classification — engineer override' : 'AI classification'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={cn('text-2xl font-semibold tracking-tight', bandText)}>
                {displayLabel(finalLabel, assessment.phase)}
              </span>
              <span className="text-sm text-ink-muted">{SEVERITY_MEANING[severity]}</span>
            </div>

            {overridden && aiLabel && (
              <p className="mt-1 text-xs text-ink-muted">
                Model originally returned <span className="font-medium">{displayLabel(aiLabel, assessment.phase)}</span>
                {confidence != null && ` at ${formatPercent(confidence)} confidence`}.
              </p>
            )}
            {!overridden && confidence != null && (
              <p className="mt-1 text-xs text-ink-muted">
                Model confidence <span className="tabular font-medium">{formatPercent(confidence)}</span>
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="text-2xs font-medium uppercase tracking-wider text-ink-subtle">Priority</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">
              {formatPercent(assessment.priority_score, 0)}
            </p>
          </div>
        </div>

        {/* Cross-validation measured UNSAFE recall at 1-in-9. A weak prediction
            has to read as an open question, not a quiet answer. */}
        {!overridden && lowConfidence && (
          <Alert tone="warn" className="mt-3" title="Low model confidence">
            The model is below {Math.round(REVIEW_THRESHOLD * 100)}% confident. Verify against the
            photos and field form before accepting this classification.
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Photos first: the evidence an engineer checks against the label. */}
          {assessment.images.length > 0 && (
            <Card>
              <CardHeader title={`Photos (${assessment.images.length})`} />
              <CardBody>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {assessment.images.map((img) => {
                    const url = imageUrls.get(img.id);
                    return (
                      <li key={img.id}>
                        <button
                          type="button"
                          onClick={() => url && setLightbox(img)}
                          disabled={!url}
                          className="group block w-full overflow-hidden rounded-control border border-line disabled:cursor-default"
                          aria-label={`View ${img.angle ?? 'photo'} full size`}
                        >
                          <span className="block aspect-4/3 bg-surface-raised">
                            {url ? (
                              <img
                                src={url}
                                alt={img.angle ? `${img.angle} view` : 'Assessment photo'}
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center px-2 text-center text-2xs text-ink-subtle">
                                Preview unavailable
                              </span>
                            )}
                          </span>
                        </button>
                        <p className="mt-1 truncate text-center text-2xs capitalize text-ink-subtle">
                          {img.angle ?? 'photo'}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          )}

          {building && (
            <Card>
              <CardHeader title="Building" />
              <CardBody className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2">
                <DataRow label="Code" value={building.building_code} />
                <DataRow label="Barangay" value={building.barangay} />
                <DataRow label="Address" value={building.address} />
                <DataRow label="Municipality" value={building.municipality} />
                <DataRow label="Use" value={<span className="capitalize">{building.building_use}</span>} />
                <DataRow label="Stories" value={building.number_of_stories} />
                <DataRow label="Year built" value={building.year_built ?? '—'} />
                <DataRow
                  label="Soil class"
                  value={
                    building.soil_classification ??
                    fieldValue(structural, 'soilClass', 'soil_class', 'soil_classification') ??
                    '—'
                  }
                />
                <DataRow
                  label="Distance to fault"
                  value={(() => {
                    const km =
                      building.distance_to_fault_km ??
                      Number(
                        fieldValue(structural, 'distanceToFaultKm', 'distance_to_fault_km') ?? NaN,
                      );
                    return Number.isFinite(km) ? `${Number(km).toFixed(2)} km` : '—';
                  })()}
                />
                <DataRow label="Previous retrofit" value={building.previous_retrofit ? 'Yes' : 'No'} />
              </CardBody>
            </Card>
          )}

          <StructuralData data={structural} />

          {(() => {
            const why = explainAssessment(assessment, building);
            if (why.agreement === 'none') return null;
            return (
              <Card>
                <CardHeader
                  title="Why this classification"
                  description="The reasoning behind the result, in the terms an engineer would check."
                />
                <CardBody className="space-y-4">
                  <p className="text-sm font-medium text-ink">{why.headline}</p>

                  <div
                    className={cn(
                      'rounded-control border px-3 py-2 text-2xs',
                      why.agreement === 'conflict'
                        ? 'border-restricted-line bg-restricted-bg text-restricted'
                        : 'border-line bg-surface-raised text-ink-muted',
                    )}
                  >
                    {why.agreementNote}
                  </div>

                  <div>
                    <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                      Contributing factors
                    </h3>
                    <ul className="divide-y divide-line">
                      {why.drivers.map((d) => (
                        <DriverRow key={d.label} driver={d} />
                      ))}
                    </ul>
                  </div>

                  <div
                    className={cn(
                      'rounded-control border px-3 py-2 text-2xs',
                      why.needsReview
                        ? 'border-restricted-line bg-restricted-bg text-restricted'
                        : 'border-line bg-surface-raised text-ink-muted',
                    )}
                  >
                    {why.confidenceNote}
                  </div>
                </CardBody>
              </Card>
            );
          })()}

          {(assessment.ai_image_probabilities != null ||
            assessment.ai_tabular_probabilities != null ||
            assessment.ai_tabular_label != null ||
            assessment.ai_feature_importance != null) && (
            <Card>
              <CardHeader
                title="Model breakdown"
                description="How each half of the model voted, and how the two were combined."
              />
              <CardBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {assessment.ai_image_probabilities && (
                  <div>
                    <h3 className="text-xs font-semibold text-ink">What the photos show</h3>
                    <p className="mb-2 text-2xs text-ink-subtle">
                      ResNet50 · reads the captured images
                    </p>
                    {Object.entries(assessment.ai_image_probabilities).map(([k, v]) => (
                      <ProbabilityRow
                        key={k}
                        label={displayLabel(k, assessment.phase)}
                        value={Number(v)}
                      />
                    ))}
                  </div>
                )}

                {(assessment.ai_tabular_probabilities || assessment.ai_tabular_label) && (
                  <div>
                    <h3 className="text-xs font-semibold text-ink">What the building profile shows</h3>
                    <p className="mb-2 text-2xs text-ink-subtle">
                      Random Forest · reads age, height, material, soil and site
                    </p>
                    {assessment.ai_tabular_probabilities ? (
                      Object.entries(assessment.ai_tabular_probabilities).map(([k, v]) => (
                        <ProbabilityRow
                          key={k}
                          label={displayLabel(k, assessment.phase)}
                          value={Number(v)}
                        />
                      ))
                    ) : (
                      <>
                        {/* Rows synced before migration 006 kept only the winning
                            class, so show that rather than fabricating a split. */}
                        <ProbabilityRow
                          label={displayLabel(assessment.ai_tabular_label, assessment.phase)}
                          value={assessment.ai_tabular_confidence ?? 0}
                        />
                        <p className="mt-1.5 text-2xs text-ink-subtle">
                          Only the leading result was recorded for this assessment.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </CardBody>

              {assessment.ai_feature_importance && (
                <div className="border-t border-line px-4 py-3">
                  <h3 className="text-xs font-semibold text-ink">
                    Which building details mattered most
                  </h3>
                  <p className="mb-2 text-2xs text-ink-subtle">
                    How much each detail influenced the building-profile result — across all
                    buildings, not this one alone.
                  </p>
                  <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                    {Object.entries(assessment.ai_feature_importance)
                      .sort(([, a], [, b]) => Number(b) - Number(a))
                      .slice(0, 8)
                      .map(([k, v]) => (
                        <ProbabilityRow key={k} label={featureName(k)} value={Number(v)} />
                      ))}
                  </div>
                </div>
              )}

              {assessment.ai_fusion_weights && (
                <div className="border-t border-line px-4 py-2.5">
                  <p className="text-2xs text-ink-subtle">
                    Final result ={' '}
                    {(assessment.ai_fusion_weights.image * 100).toFixed(0)}% of the photo result +{' '}
                    {(assessment.ai_fusion_weights.tabular * 100).toFixed(0)}% of the building-profile
                    result.
                  </p>
                </div>
              )}
            </Card>
          )}

          {assessment.action_recommendations && assessment.action_recommendations.length > 0 && (
            <Card>
              <CardHeader
                title="Recommended actions"
                actions={
                  <Badge tone={assessment.action_generated_by === 'gemini' ? 'brand' : 'neutral'}>
                    {assessment.action_generated_by === 'gemini' ? 'AI generated' : 'Standard template'}
                  </Badge>
                }
              />
              <CardBody>
                <ol className="space-y-2.5">
                  {assessment.action_recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700"
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm text-ink-muted">{rec}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 border-t border-line pt-3 text-2xs text-ink-subtle">
                  These recommendations are advisory and require sign-off by a licensed engineer.
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Review rail */}
        <div className="space-y-4">
          <Card raised>
            <CardHeader title="Engineer review" />
            <CardBody>
              {assessment.reviewed_by ? (
                <div className="space-y-3">
                  <Alert tone="ok" title="Reviewed">
                    {assessment.reviewed_at
                      ? new Date(assessment.reviewed_at).toLocaleString()
                      : 'Timestamp not recorded'}
                  </Alert>
                  {assessment.override_classification && (
                    <div className="rounded-card border border-restricted-line bg-restricted-bg p-3">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-restricted">
                        Classification overridden
                      </p>
                      <div className="mt-1.5">
                        <ClassificationBadge label={assessment.override_classification} phase={assessment.phase} size="sm" />
                      </div>
                      {assessment.review_justification && (
                        <p className="mt-2 text-xs text-ink-muted">{assessment.review_justification}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : !canSubmitReview ? (
                <p className="text-xs text-ink-subtle">
                  This assessment is awaiting review. Only engineers and administrators can sign
                  one off.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-ink-muted">
                    Confirm the AI classification, or override it with a reason for the record.
                  </p>

                  {reviewError && <Alert tone="danger">{reviewError}</Alert>}

                  <Field label="Classification">
                    {(props) => (
                      <Select
                        {...props}
                        value={overrideClass}
                        onChange={(e) => setOverrideClass(e.target.value)}
                      >
                        <option value="">Accept AI result</option>
                        {/* Stored in ATC-20 terms whichever phase this is; the
                            wording follows the phase so the engineer picks from
                            the framework they are actually working in. */}
                        <option value="SAFE">Override → {displayLabel('SAFE', assessment.phase)}</option>
                        <option value="RESTRICTED">Override → {displayLabel('RESTRICTED', assessment.phase)}</option>
                        <option value="UNSAFE">Override → {displayLabel('UNSAFE', assessment.phase)}</option>
                      </Select>
                    )}
                  </Field>

                  {overrideClass && (
                    <Field
                      label="Justification"
                      required
                      hint="Recorded against your name in the assessment history."
                    >
                      {(props) => (
                        <Textarea
                          {...props}
                          rows={4}
                          value={justification}
                          onChange={(e) => setJustification(e.target.value)}
                          placeholder="What did you observe that changes the classification?"
                          invalid={Boolean(reviewError && !justification.trim())}
                        />
                      )}
                    </Field>
                  )}

                  <Button
                    variant="primary"
                    fullWidth
                    loading={reviewSubmitting}
                    onClick={handleSubmitReview}
                  >
                    {reviewSubmitting
                      ? 'Saving…'
                      : overrideClass
                        ? 'Save override'
                        : 'Confirm classification'}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Record" />
            <CardBody>
              <dl>
                <DataRow
                  label="Phase"
                  value={assessment.phase === 'pre-earthquake' ? 'Pre-earthquake' : 'Post-earthquake'}
                />
                <DataRow label="Status" value={<StatusBadge status={assessment.status} />} />
                <DataRow
                  label="Recorded"
                  value={new Date(assessment.created_at).toLocaleString()}
                />
                <DataRow label="Photos" value={assessment.images.length} />
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Photo viewer */}
      <Modal
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        title={lightbox?.angle ? `${lightbox.angle} view` : 'Assessment photo'}
        description={lightbox?.original_filename}
        size="lg"
      >
        {lightbox && imageUrls.get(lightbox.id) && (
          <img
            src={imageUrls.get(lightbox.id)}
            alt={lightbox.angle ? `${lightbox.angle} view` : 'Assessment photo'}
            className="mx-auto max-h-[60vh] w-auto rounded-control"
          />
        )}
      </Modal>
    </>
  );
}
