import { Platform } from 'react-native';

import { classesForPhase, IMG_SIZE, phaseKey } from './constants';
import type { BranchPrediction } from './fusion';
import { getMobileManifest, modelPath } from './modelLoader';
import { applyResNetPreprocess } from './resnetPreprocess';

type TfliteModule = {
  loadTensorflowModel: (path: string) => Promise<{
    run: (inputs: unknown[]) => Promise<unknown[]>;
  }>;
};

let tfliteMod: TfliteModule | null | undefined;

function getTflite(): TfliteModule | null {
  if (tfliteMod !== undefined) return tfliteMod;
  if (Platform.OS !== 'android') {
    tfliteMod = null;
    return null;
  }
  try {
    tfliteMod = require('react-native-fast-tflite') as TfliteModule;
  } catch {
    tfliteMod = null;
  }
  return tfliteMod;
}

const modelCache: Partial<Record<'pre' | 'post', Awaited<ReturnType<TfliteModule['loadTensorflowModel']>>>> =
  {};

async function loadModel(phase: 'pre' | 'post') {
  if (modelCache[phase]) return modelCache[phase]!;
  const tflite = getTflite();
  if (!tflite) throw new Error('TFLite not available');

  const manifest = getMobileManifest();
  const file = manifest?.[phase]?.resnet?.file ?? `resnet50_${phase}.tflite`;
  const path = modelPath(file);
  if (!path) throw new Error('Model path unavailable');

  modelCache[phase] = await tflite.loadTensorflowModel(path);
  return modelCache[phase]!;
}

function probsFromOutput(output: unknown, classes: readonly string[]): Record<string, number> {
  const arr = normalizeOutputArray(output);
  const out: Record<string, number> = {};
  classes.forEach((c, i) => {
    out[c] = arr[i] ?? 0;
  });
  return out;
}

function normalizeOutputArray(output: unknown): number[] {
  if (output instanceof Float32Array) return Array.from(output);
  if (Array.isArray(output)) {
    if (output.length > 0 && Array.isArray(output[0])) return (output[0] as number[]).map(Number);
    return output.map(Number);
  }
  return [];
}

function bestLabel(probs: Record<string, number>): { label: string; confidence: number } {
  let label = '';
  let confidence = 0;
  for (const [k, v] of Object.entries(probs)) {
    if (v > confidence) {
      confidence = v;
      label = k;
    }
  }
  return { label, confidence };
}

/** Run ResNet TFLite on one or more preprocessed RGB uint8 tensors; average probabilities. */
export async function runResNetTflite(params: {
  phase: string;
  rgbBatch: Uint8Array[];
}): Promise<BranchPrediction> {
  const pk = phaseKey(params.phase);
  const classes = classesForPhase(params.phase);
  const model = await loadModel(pk);

  const sums = new Array(classes.length).fill(0);
  for (const rgb of params.rgbBatch) {
    if (rgb.length !== IMG_SIZE * IMG_SIZE * 3) {
      throw new Error(`Expected RGB ${IMG_SIZE}x${IMG_SIZE}x3`);
    }
    const preprocessed = applyResNetPreprocess(rgb);
    const outputs = await model.run([preprocessed]);
    const probs = normalizeOutputArray(outputs[0]);
    for (let i = 0; i < classes.length; i++) {
      sums[i] += probs[i] ?? 0;
    }
  }
  const n = params.rgbBatch.length;
  const probabilities: Record<string, number> = {};
  classes.forEach((c, i) => {
    probabilities[c] = (sums[i] ?? 0) / n;
  });
  const { label, confidence } = bestLabel(probabilities);
  return { label, confidence, probabilities };
}

export function isTfliteAvailable(): boolean {
  return getTflite() != null && Platform.OS === 'android';
}

export { probsFromOutput };
