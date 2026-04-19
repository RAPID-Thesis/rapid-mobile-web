/**
 * On-device risk estimate when the API is unreachable.
 * Uses the same label vocabulary as the server (pre: low/moderate/high, post: SAFE/RESTRICTED/UNSAFE).
 * This is a lightweight heuristic — server fusion (ResNet + RF) replaces it after sync.
 */

import type { AssessmentPhase, BuildingUse } from '../types';

/** Subset of the wizard structural form used for offline scoring. */
export interface OfflineStructuralForm {
  primaryMaterial: string;
  structuralSystem: string;
  soilClass: string;
  topography: string;
  condition: string;
  verticalIrregularity: boolean;
  planIrregularity: boolean;
  poundingHazard: boolean;
  fallingHazard: boolean;
}

export type LocalPredictionSource = 'device-offline-heuristic';

export interface LocalPredictionResult {
  phase: 'pre' | 'post';
  fusedLabel: string;
  fusedConfidence: number;
  probabilities: Record<string, number>;
  tabularLabel: string;
  tabularConfidence: number;
  imageLabel: string | null;
  imageConfidence: number | null;
  source: LocalPredictionSource;
}

const PRE_ORDER = ['low', 'moderate', 'high'] as const;
const POST_ORDER = ['SAFE', 'RESTRICTED', 'UNSAFE'] as const;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function softmax3(logits: [number, number, number], labels: readonly string[]): Record<string, number> {
  const m = Math.max(logits[0], logits[1], logits[2]);
  const e0 = Math.exp(logits[0] - m);
  const e1 = Math.exp(logits[1] - m);
  const e2 = Math.exp(logits[2] - m);
  const s = e0 + e1 + e2;
  return {
    [labels[0]]: e0 / s,
    [labels[1]]: e1 / s,
    [labels[2]]: e2 / s,
  };
}

function soilRisk(soilClass: string): number {
  const s = soilClass.toLowerCase();
  if (s.includes('type e') || s.includes('type f')) return 0.22;
  if (s.includes('type d')) return 0.12;
  if (s.includes('type c')) return 0.06;
  if (s.includes('type a') || s.includes('type b')) return 0.02;
  return 0.1;
}

function materialRisk(material: string): number {
  const m = material.toLowerCase();
  if (m.includes('wood') || m.includes('light wood')) return 0.18;
  if (m.includes('chb') || m.includes('hollow')) return 0.12;
  if (m.includes('steel')) return 0.05;
  if (m.includes('concrete') || m.includes('rc')) return 0.03;
  return 0.08;
}

function topoRisk(topography: string): number {
  const t = topography.toLowerCase();
  if (t.includes('steep') || t.includes('hill') || t.includes('slope')) return 0.1;
  return 0.02;
}

function conditionRisk(condition: string, phase: AssessmentPhase): number {
  const c = condition.toLowerCase();
  if (phase === 'post-earthquake') {
    if (c.includes('collapse') || c.includes('severe') || c.includes('partial')) return 0.55;
    if (c.includes('poor') || c.includes('moderate') || c.includes('crack')) return 0.35;
    if (c.includes('good') || c.includes('minor')) return 0.08;
  }
  return 0.1;
}

/**
 * Heuristic pre-Earthquake vulnerability score in [0, 1].
 */
function preEarthquakeScore(
  yearBuilt: number | null,
  stories: number,
  structural: OfflineStructuralForm,
  imageCount: number,
  buildingUse: BuildingUse
): number {
  const age = yearBuilt != null ? Math.max(0, 2026 - yearBuilt) : 25;
  let score = 0.12;
  score += clamp01(age / 80) * 0.38;
  score += clamp01(stories / 18) * 0.22;
  score += soilRisk(structural.soilClass || '');
  score += materialRisk(structural.primaryMaterial || '');
  score += topoRisk(structural.topography || '');
  if (structural.verticalIrregularity) score += 0.09;
  if (structural.planIrregularity) score += 0.09;
  if (structural.poundingHazard) score += 0.1;
  if (structural.fallingHazard) score += 0.1;
  if (buildingUse === 'institutional' || buildingUse === 'industrial') score += 0.05;
  // More documentation photos slightly increase estimated exposure (weak proxy — no CNN offline).
  score += clamp01((imageCount - 1) / 6) * 0.06;
  return clamp01(score);
}

/**
 * Heuristic post-Earthquake damage score in [0, 1].
 */
function postEarthquakeScore(
  structural: OfflineStructuralForm,
  imageCount: number,
  yearBuilt: number | null
): number {
  let score = conditionRisk(structural.condition || '', 'post-earthquake');
  const age = yearBuilt != null ? Math.max(0, 2026 - yearBuilt) : 20;
  score += clamp01(age / 90) * 0.15;
  score += soilRisk(structural.soilClass || '') * 0.5;
  if (structural.verticalIrregularity) score += 0.12;
  if (structural.planIrregularity) score += 0.1;
  if (structural.poundingHazard) score += 0.14;
  if (structural.fallingHazard) score += 0.14;
  score += clamp01((imageCount - 1) / 5) * 0.1;
  return clamp01(score);
}

export function predictOfflineHeuristic(params: {
  phase: AssessmentPhase;
  buildingUse: BuildingUse;
  yearBuilt: number | null;
  numberOfStories: number;
  structuralData: OfflineStructuralForm;
  imageCount: number;
}): LocalPredictionResult {
  const { phase, buildingUse, yearBuilt, numberOfStories, structuralData, imageCount } = params;

  if (phase === 'pre-earthquake') {
    const r = preEarthquakeScore(yearBuilt, numberOfStories, structuralData, imageCount, buildingUse);
    const logits: [number, number, number] = [
      -Math.abs(r - 0.22) * 8,
      -Math.abs(r - 0.52) * 8,
      -Math.abs(r - 0.82) * 8,
    ];
    const probs = softmax3(logits, PRE_ORDER);
    let best: (typeof PRE_ORDER)[number] = 'moderate';
    let pBest = 0;
    for (const k of PRE_ORDER) {
      if (probs[k] > pBest) {
        pBest = probs[k];
        best = k;
      }
    }
    const tabularLabel = best;
    const tabularConfidence = pBest;
    return {
      phase: 'pre',
      fusedLabel: best,
      fusedConfidence: pBest,
      probabilities: probs,
      tabularLabel,
      tabularConfidence,
      imageLabel: null,
      imageConfidence: null,
      source: 'device-offline-heuristic',
    };
  }

  const r = postEarthquakeScore(structuralData, imageCount, yearBuilt);
  const logits: [number, number, number] = [
    -Math.abs(r - 0.18) * 10,
    -Math.abs(r - 0.52) * 10,
    -Math.abs(r - 0.85) * 10,
  ];
  const probs = softmax3(logits, POST_ORDER);
  let best: (typeof POST_ORDER)[number] = 'RESTRICTED';
  let pBest = 0;
  for (const k of POST_ORDER) {
    if (probs[k] > pBest) {
      pBest = probs[k];
      best = k;
    }
  }
  return {
    phase: 'post',
    fusedLabel: best,
    fusedConfidence: pBest,
    probabilities: probs,
    tabularLabel: best,
    tabularConfidence: pBest,
    imageLabel: null,
    imageConfidence: null,
    source: 'device-offline-heuristic',
  };
}
