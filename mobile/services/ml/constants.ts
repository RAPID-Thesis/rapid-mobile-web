export const PRE_CLASSES = ['high', 'low', 'moderate'] as const;
export const POST_CLASSES = ['RESTRICTED', 'SAFE', 'UNSAFE'] as const;

export const IMAGE_WEIGHT = 0.45;
export const TABULAR_WEIGHT = 0.55;

export const IMG_SIZE = 224;

export type PhaseKey = 'pre' | 'post';

export function phaseKey(phase: string): PhaseKey {
  const p = phase.toLowerCase();
  if (p.startsWith('pre')) return 'pre';
  if (p.startsWith('post')) return 'post';
  throw new Error(`Unknown phase: ${phase}`);
}

export function classesForPhase(phase: string): readonly string[] {
  return phaseKey(phase) === 'pre' ? PRE_CLASSES : POST_CLASSES;
}

/** Canonical severity remap; both phases share one visual severity model. */
export const PRE_TO_POST: Record<string, string> = {
  low: 'SAFE',
  moderate: 'RESTRICTED',
  high: 'UNSAFE',
};

/**
 * Class order the ResNet actually emits, which is NOT the canonical order for post.
 *
 * The network is trained on folders named low/moderate/high, so its output axis is always
 * alphabetical PRE order (high, low, moderate). Remapped to ATC-20 that is
 * (UNSAFE, SAFE, RESTRICTED) -- while POST_CLASSES is alphabetical (RESTRICTED, SAFE, UNSAFE).
 *
 * Reading the raw output against POST_CLASSES swapped UNSAFE and RESTRICTED, posting the most
 * severely damaged buildings as "limited entry" instead of "do not enter". Must match
 * `_resnet_output_classes` in backend/app/services/ml_fusion_engine.py.
 */
export function resnetOutputClasses(phase: string): readonly string[] {
  if (phaseKey(phase) === 'pre') return PRE_CLASSES;
  return PRE_CLASSES.map((c) => PRE_TO_POST[c]!);
}
