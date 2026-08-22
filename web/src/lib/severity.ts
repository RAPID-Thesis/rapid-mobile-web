/* ============================================================================
   Safety classification vocabulary
   ----------------------------------------------------------------------------
   The two label sets are the same severity signal under different frameworks:

     FEMA P-154 (pre-earthquake)   low       moderate     high
     ATC-20     (post-earthquake)  SAFE      RESTRICTED   UNSAFE

   Kept in lib/ rather than alongside the components so the constants can be
   imported by non-component modules without breaking React fast refresh.
   ========================================================================= */

export type Severity = 'safe' | 'restricted' | 'unsafe' | 'unknown';

const SEVERITY_BY_LABEL: Record<string, Severity> = {
  low: 'safe',
  safe: 'safe',
  moderate: 'restricted',
  restricted: 'restricted',
  high: 'unsafe',
  unsafe: 'unsafe',
};

export function severityOf(label: string | null | undefined): Severity {
  if (!label) return 'unknown';
  return SEVERITY_BY_LABEL[label.trim().toLowerCase()] ?? 'unknown';
}

export const SEVERITY_STYLES: Record<Severity, string> = {
  safe: 'bg-safe-bg text-safe border-safe-line',
  restricted: 'bg-restricted-bg text-restricted border-restricted-line',
  unsafe: 'bg-unsafe-bg text-unsafe border-unsafe-line',
  unknown: 'bg-surface-raised text-ink-subtle border-line',
};

export const SEVERITY_DOT: Record<Severity, string> = {
  safe: 'bg-safe',
  restricted: 'bg-restricted',
  unsafe: 'bg-unsafe',
  unknown: 'bg-line-strong',
};

/** Plain-language gloss so the label is never the only carrier of meaning. */
export const SEVERITY_MEANING: Record<Severity, string> = {
  safe: 'Normal occupancy',
  restricted: 'Limited entry',
  unsafe: 'Do not enter',
  unknown: 'Not yet classified',
};

/**
 * Below this, a prediction is shown as unresolved rather than merely
 * lower-confidence, routing the record to engineer review.
 *
 * Set at 0.5 rather than 0.7. The earlier value dated from when cross-validation
 * put `high` recall at 1-in-9, and flagging everything under 70% was a reasonable
 * hedge against a model that could not see severe damage. Retraining moved that
 * recall to 0.838 [0.69-0.92] and macro F1 to 0.837, so a 60%-confident call is
 * now usually right and flagging it buried the genuinely uncertain cases in
 * noise. A "needs review" that fires on most records stops being a signal.
 */
export const REVIEW_THRESHOLD = 0.5;
