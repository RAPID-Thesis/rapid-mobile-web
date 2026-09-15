import { Platform } from 'react-native';

import type { AssessmentPhase, BuildingUse } from '../types';
import {
  predictOfflineHeuristic,
  type LocalPredictionResult,
  type OfflineStructuralForm,
} from './localPredict';
import { fusePredictions } from './ml/fusion';
import { evaluateImageTensor } from './ml/imageGate';
import { preprocessPhotoForModel } from './ml/imagePreprocess';
import { ensureModelsLoaded, getMobileManifest } from './ml/modelLoader';
import { isOnnxAvailable, runRfOnnx } from './ml/onnxRunner';
import { isTfliteAvailable, runResNetTflite } from './ml/tfliteRunner';
import { buildTabularFeatureRow } from './ml/tabularFeatures';
import { phaseKey } from './ml/constants';

export interface PredictOnDeviceParams {
  phase: AssessmentPhase;
  buildingUse: BuildingUse;
  yearBuilt: number | null;
  numberOfStories: number;
  structuralData: OfflineStructuralForm;
  photoUris: string[];
  latitude: number | null;
  longitude: number | null;
}

let modelsInitAttempted = false;
let modelsReady = false;

/** Pre-load TFLite + ONNX models (Android native build only). */
export async function initOnDeviceMl(): Promise<boolean> {
  if (modelsInitAttempted) return modelsReady;
  modelsInitAttempted = true;
  if (Platform.OS !== 'android') {
    modelsReady = false;
    return false;
  }
  modelsReady = await ensureModelsLoaded();
  return modelsReady;
}

export function isOnDeviceMlReady(): boolean {
  return modelsReady && isTfliteAvailable() && isOnnxAvailable();
}

/**
 * Primary offline predictor: ResNet50 + Random Forest + late fusion on Android.
 * Falls back to rule-based heuristic when models or native runtime unavailable.
 */
export async function predictOnDevice(params: PredictOnDeviceParams): Promise<LocalPredictionResult> {
  const fallback = () =>
    predictOfflineHeuristic({
      phase: params.phase,
      buildingUse: params.buildingUse,
      yearBuilt: params.yearBuilt,
      numberOfStories: params.numberOfStories,
      structuralData: params.structuralData,
      imageCount: params.photoUris.length,
    });

  if (Platform.OS !== 'android') {
    return fallback();
  }

  try {
    await initOnDeviceMl();
    if (!modelsReady || !isTfliteAvailable() || !isOnnxAvailable()) {
      return fallback();
    }

    const manifest = getMobileManifest();
    if (!manifest) return fallback();

    const tabularRow = buildTabularFeatureRow({
      phase: params.phase,
      buildingUse: params.buildingUse,
      yearBuilt: params.yearBuilt,
      numberOfStories: params.numberOfStories,
      structuralData: params.structuralData,
      latitude: params.latitude,
      longitude: params.longitude,
    });

    // Sequential on purpose: decoding photos in parallel multiplies peak native
    // memory by the photo count, and eight at once is enough to get the process
    // killed. A photo that will not decode is skipped rather than failing the
    // whole prediction -- losing one image is a smaller loss than losing the
    // image branch entirely.
    const rgbBatch: Uint8Array[] = [];
    let rejectedImages = 0;
    for (const uri of params.photoUris) {
      try {
        const rgb = await preprocessPhotoForModel(uri);

        // The validity gate, applied where it cannot be bypassed. The capture
        // screen already warns on a bad subject, but photos can also arrive from
        // a retake flow or a queued record, and a person's portrait must never
        // reach the classifier just because it took a different route in.
        //
        // Only a 'block' verdict drops the photo; a 'warn' is advisory and the
        // inspector has already seen it. The tensor is reused as-is, so the gate
        // costs one extra inference and no extra decode.
        const gate = await evaluateImageTensor(rgb);
        if (gate.verdict === 'block') {
          rejectedImages++;
          continue;
        }

        rgbBatch.push(rgb);
      } catch (e) {
        console.warn('[ML] skipping unreadable photo:', e);
      }
    }

    // With every photo rejected this is null, and fusion degrades to
    // tabular-only with weights {image: 0, tabular: 1} -- the same path a
    // capture with no photos has always taken. The frozen models and the fusion
    // arithmetic are untouched by the gate.
    const imageBranch =
      rgbBatch.length > 0
        ? await runResNetTflite({ phase: params.phase, rgbBatch })
        : null;

    const tabularBranch = await runRfOnnx({ phase: params.phase, row: tabularRow });

    if (!imageBranch && !tabularBranch) return fallback();

    const fused = fusePredictions({
      phase: params.phase,
      image: imageBranch,
      tabular: tabularBranch,
      imageWeight: manifest.fusion.image_weight,
      tabularWeight: manifest.fusion.tabular_weight,
    });

    const pk = phaseKey(params.phase);

    return {
      phase: pk,
      fusedLabel: fused.label,
      fusedConfidence: fused.confidence,
      probabilities: fused.probabilities,
      tabularLabel: tabularBranch.label,
      tabularConfidence: tabularBranch.confidence,
      imageLabel: imageBranch?.label ?? null,
      imageConfidence: imageBranch?.confidence ?? null,
      imageProbabilities: imageBranch?.probabilities ?? null,
      tabularProbabilities: tabularBranch.probabilities,
      fusionWeights: fused.weights,
      source: 'device-ml-fusion',
      rejectedImages,
    };
  } catch (e) {
    console.warn('[ML] predictOnDevice failed, using heuristic:', e);
    return fallback();
  }
}
