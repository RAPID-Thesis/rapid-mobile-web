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
