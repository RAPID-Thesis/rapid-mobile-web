import { classesForPhase, IMAGE_WEIGHT, TABULAR_WEIGHT } from './constants';

export interface BranchPrediction {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface FusionResult {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
  weights: { image: number; tabular: number };
  image: BranchPrediction | null;
  tabular: BranchPrediction | null;
}

function vecFromProbs(classes: readonly string[], probs: Record<string, number>): number[] {
  return classes.map((c) => probs[c] ?? 0);
}

function probsFromVec(classes: readonly string[], vec: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  classes.forEach((c, i) => {
    out[c] = vec[i] ?? 0;
  });
  return out;
}

function argmax(classes: readonly string[], vec: number[]): { label: string; confidence: number } {
  let bestIdx = 0;
  let best = vec[0] ?? 0;
  for (let i = 1; i < classes.length; i++) {
    const v = vec[i] ?? 0;
    if (v > best) {
      best = v;
      bestIdx = i;
    }
  }
  return { label: classes[bestIdx]!, confidence: best };
}

/** Late fusion — mirrors backend predict_fused(). */
export function fusePredictions(params: {
  phase: string;
  image: BranchPrediction | null;
  tabular: BranchPrediction | null;
  imageWeight?: number;
  tabularWeight?: number;
}): FusionResult {
  const classes = classesForPhase(params.phase);
  const iw = params.imageWeight ?? IMAGE_WEIGHT;
  const tw = params.tabularWeight ?? TABULAR_WEIGHT;

  const imageVec = params.image ? vecFromProbs(classes, params.image.probabilities) : null;
  const tabularVec = params.tabular ? vecFromProbs(classes, params.tabular.probabilities) : null;

  let fusedVec: number[];
  let weights: { image: number; tabular: number };

  if (!imageVec && !tabularVec) {
    throw new Error('fusePredictions requires at least one modality');
  }
  if (!imageVec) {
    fusedVec = tabularVec!;
    weights = { image: 0, tabular: 1 };
  } else if (!tabularVec) {
    fusedVec = imageVec;
    weights = { image: 1, tabular: 0 };
  } else {
    const total = iw + tw;
    const ni = iw / total;
    const nt = tw / total;
    fusedVec = classes.map((_, i) => ni * (imageVec[i] ?? 0) + nt * (tabularVec[i] ?? 0));
    weights = { image: ni, tabular: nt };
  }

  const { label, confidence } = argmax(classes, fusedVec);
  return {
    label,
    confidence,
    probabilities: probsFromVec(classes, fusedVec),
    weights,
    image: params.image,
    tabular: params.tabular,
  };
}
