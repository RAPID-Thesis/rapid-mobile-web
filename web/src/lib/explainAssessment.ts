import type { Assessment, Building } from '../types';
import { REVIEW_THRESHOLD, severityOf, type Severity } from './severity';

/* ============================================================================
   Why did the model say that?

   A classification an inspector cannot interrogate is one they can only accept
   or ignore. This turns the stored branch outputs into the reasoning an engineer
   would want before signing off: which branch drove the call, whether the two
   agreed, what building characteristics pushed it, and how far the result should
   be trusted.

   Reads only what the record already stores — no recomputation, so it can never
   disagree with the classification it explains.
   ========================================================================= */

export type Agreement = 'agree' | 'conflict' | 'single' | 'none';

export interface Driver {
  label: string;
  detail: string;
  /** Whether this pushed toward more or less severity, when that is knowable. */
  direction: 'raises' | 'lowers' | 'neutral';
}

export interface Explanation {
  headline: string;
  agreement: Agreement;
  agreementNote: string;
  drivers: Driver[];
  confidenceNote: string;
  /** True when the record should be treated as unresolved rather than answered. */
  needsReview: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = {
  safe: 0,
  restricted: 1,
  unsafe: 2,
  unknown: -1,
};

/** Turn `cat__structural_system_wood_frame` into `structural system wood frame`. */
function humanizeFeature(key: string): string {
  return key
    .replace(/^cat__|^num__/, '')
    .replace(/_/g, ' ')
    .trim();
}

function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function describeAge(yearBuilt: number | null | undefined): Driver | null {
  if (!yearBuilt) return null;
  const age = new Date().getFullYear() - yearBuilt;
  if (age < 0) return null;

  // The National Structural Code of the Philippines gained modern seismic
  // provisions in 1992; buildings predating it were not designed for the demands
  // now expected of them.
  if (yearBuilt < 1992) {
    return {
      label: 'Built before the 1992 seismic code',
      detail: `${yearBuilt} · ${age} years old. Predates modern NSCP seismic provisions.`,
      direction: 'raises',
    };
  }
  if (age > 30) {
    return {
      label: 'Ageing structure',
      detail: `${yearBuilt} · ${age} years old.`,
      direction: 'raises',
    };
  }
  return {
    label: 'Relatively recent construction',
    detail: `${yearBuilt} · ${age} years old. Built under modern seismic provisions.`,
    direction: 'lowers',
  };
}

function describeSoil(soil: string | null | undefined): Driver | null {
  if (!soil) return null;
  const code = String(soil).trim().toUpperCase();
  if (code === 'E' || code === 'F') {
    return {
      label: `Soft soil (Class ${code})`,
      detail: 'Soft profiles amplify ground shaking relative to rock.',
      direction: 'raises',
    };
  }
  if (code === 'B' || code === 'A') {
    return {
      label: `Firm ground (Class ${code})`,
      detail: 'Stiffer soils transmit less amplification.',
      direction: 'lowers',
    };
  }
  return {
    label: `Site soil Class ${code}`,
    detail: 'Standard stiff-soil profile.',
    direction: 'neutral',
  };
}

function describeFault(km: number | null | undefined): Driver | null {
  if (km == null) return null;
  if (km <= 5) {
    return {
      label: 'Close to a mapped fault',
      detail: `${km.toFixed(1)} km from the nearest PHIVOLCS trace.`,
      direction: 'raises',
    };
  }
  if (km >= 15) {
    return {
      label: 'Distant from mapped faults',
      detail: `${km.toFixed(1)} km from the nearest PHIVOLCS trace.`,
      direction: 'lowers',
    };
  }
  return {
    label: 'Moderate fault distance',
    detail: `${km.toFixed(1)} km from the nearest PHIVOLCS trace.`,
    direction: 'neutral',
  };
}

function describeStoreys(stories: number | null | undefined): Driver | null {
  if (!stories || stories < 4) return null;
  return {
    label: `${stories} storeys`,
    detail: 'Taller structures attract greater seismic demand.',
    direction: 'raises',
  };
}

export function explainAssessment(
  assessment: Assessment,
  building: Building | null,
): Explanation {
  const finalLabel = assessment.override_classification ?? assessment.ai_fused_label;
  const finalSeverity = severityOf(finalLabel);

  const imageSeverity = severityOf(assessment.ai_image_label);
  const tabularSeverity = severityOf(assessment.ai_tabular_label);
  const hasImage = imageSeverity !== 'unknown';
  const hasTabular = tabularSeverity !== 'unknown';

  // --- How the two branches related --------------------------------------
  let agreement: Agreement = 'none';
  let agreementNote = 'No branch output was recorded for this assessment.';

  if (hasImage && hasTabular) {
    if (imageSeverity === tabularSeverity) {
      agreement = 'agree';
      agreementNote =
        'The photo evidence and the building characteristics point to the same conclusion, ' +
        'which is the strongest case the system can make on its own.';
    } else {
      agreement = 'conflict';
      const stronger =
        SEVERITY_RANK[imageSeverity] > SEVERITY_RANK[tabularSeverity] ? 'photos' : 'building data';
      agreementNote =
        `The two branches disagree: the ${stronger} indicate greater severity than the other. ` +
        'The fused result splits the difference by weighting, so this record deserves a closer look.';
    }
  } else if (hasImage || hasTabular) {
    agreement = 'single';
    agreementNote = hasImage
      ? 'Only the photo branch produced a result, so the structural characteristics did not inform this call.'
      : 'Only the structural branch produced a result — no usable photo evidence was available.';
  }

  // --- What pushed the classification ------------------------------------
  const drivers: Driver[] = [];

  if (hasImage) {
    drivers.push({
      label: `Photo evidence reads ${String(assessment.ai_image_label).toLowerCase()}`,
      detail: `ResNet50 assigned ${pct(assessment.ai_image_confidence)} to this class from the captured images.`,
      direction: SEVERITY_RANK[imageSeverity] >= SEVERITY_RANK[finalSeverity] ? 'raises' : 'lowers',
    });
  }

  if (hasTabular) {
    const topFeatures = Object.entries(assessment.ai_feature_importance ?? {})
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 3)
      .map(([k]) => humanizeFeature(k));
    drivers.push({
      label: `Building profile reads ${String(assessment.ai_tabular_label).toLowerCase()}`,
      detail:
        topFeatures.length > 0
          ? `Random Forest gave ${pct(assessment.ai_tabular_confidence)}, weighing ${topFeatures.join(', ')} most heavily.`
          : `Random Forest assigned ${pct(assessment.ai_tabular_confidence)} to this class.`,
      direction:
        SEVERITY_RANK[tabularSeverity] >= SEVERITY_RANK[finalSeverity] ? 'raises' : 'lowers',
    });
  }

  const structural = assessment.structural_data ?? {};
  const soil =
    (structural.soilClass as string | undefined) ??
    (structural.soil_class as string | undefined) ??
    building?.soil_classification;

  for (const d of [
    describeAge(building?.year_built),
    describeSoil(soil),
    describeFault(building?.distance_to_fault_km),
    describeStoreys(building?.number_of_stories),
  ]) {
    if (d) drivers.push(d);
  }

  // --- How far to trust it ------------------------------------------------
  const confidence = assessment.ai_fused_confidence;
  const needsReview = confidence != null && confidence < REVIEW_THRESHOLD;

  let confidenceNote: string;
  if (confidence == null) {
    confidenceNote = 'No confidence score was recorded for this assessment.';
  } else if (needsReview) {
    confidenceNote =
      `At ${pct(confidence)} the model is close to guessing between classes. Treat this as ` +
      'unresolved until an engineer confirms it.';
  } else if (confidence >= 0.85) {
    confidenceNote = `The model is ${pct(confidence)} confident — a clear separation from the other classes.`;
  } else {
    confidenceNote = `The model is ${pct(confidence)} confident, which is a usable but not decisive margin.`;
  }

  // --- Headline -----------------------------------------------------------
  let headline: string;
  if (assessment.override_classification) {
    headline = `An engineer set this to ${assessment.override_classification}, overriding the model.`;
  } else if (agreement === 'agree') {
    headline = `Both models independently reached ${finalLabel ?? 'the same result'}.`;
  } else if (agreement === 'conflict') {
    headline = `The models disagreed; weighting resolved this to ${finalLabel ?? 'the fused result'}.`;
  } else if (agreement === 'single') {
    headline = `Based on a single branch, this reads as ${finalLabel ?? 'unclassified'}.`;
  } else {
    headline = 'This assessment has not been classified.';
  }

  return { headline, agreement, agreementNote, drivers, confidenceNote, needsReview };
}
