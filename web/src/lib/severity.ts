/* ============================================================================
   Safety classification vocabulary
   ----------------------------------------------------------------------------
   The two label sets are the same severity signal under different frameworks:

     FEMA P-154 (pre-quake)   low       moderate     high
     ATC-20     (post-quake)  SAFE      RESTRICTED   UNSAFE

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
 * lower-confidence. Cross-validation put UNSAFE recall at 1-in-9, so a
 * confident-looking badge on a weak prediction would overstate what the model
 * knows. Engineer review is the backstop and the UI has to route work into it.
 */
export const REVIEW_THRESHOLD = 0.7;
