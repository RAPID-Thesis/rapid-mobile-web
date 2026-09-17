import { Platform } from 'react-native';

import { IMG_SIZE } from './constants';
import { ensureModelsLoaded, isOptionalModelAvailable, modelPath } from './modelLoader';

// `.json` is a Metro source extension, so this is the parsed object, not an
// asset handle -- the buckets and thresholds are available with no file IO.
import gateSpec from '../../assets/models/image_gate_buckets.json';

/* ============================================================================
   Image validity gate

   Nothing in the RAPID pipeline can tell a wall from a person. Its three classes
   are all buildings, so "not a building" is not a question the fused model can
   be asked -- point the camera at a colleague and it still returns a confident
   FEMA P-154 band. This runs first and decides whether a photo is worth
   classifying at all.

   It is a separate model. The frozen ResNet50 and Random Forest, their class
   orders and the 0.45/0.55 fusion weights are untouched: a rejected photo is
   simply not passed to them, and fusion already handles that case -- it is the
   same path as a capture with no photos, which degrades to tabular-only.

   The gate asserts the NEGATIVE, not the positive. It does not score "is this a
   building?", because the image branch trains on close-ups of concrete surfaces
   and cracks rather than facades, and a building detector measured *worse* than
   chance on that data (see ml/scripts/export_image_gate_model.py). Instead it
   asks "is this confidently a person, a meal, a pet, a vehicle?" -- categories
   that are all but silent on genuine assessment photos, which is what lets it
   block on them. Across all 1,602 labelled photos, none trips a blocking bucket.

   Fails open, always. A gate that cannot load, cannot decode, or throws must
   never cost an inspector a capture: the photo goes through exactly as it did
   before this file existed.
   ========================================================================= */

const MODEL_FILE = 'image_gate.tflite';

type TfliteModule = {
  loadTensorflowModel: (source: { url: string } | number) => Promise<{
    run: (inputs: unknown[]) => Promise<unknown[]>;
  }>;
};

interface GateSpec {
  model: string;
  buckets: Record<string, number[]>;
  blocking: string[];
  thresholds: Record<string, number>;
}

const spec = gateSpec as unknown as GateSpec;

export type GateVerdict = 'accept' | 'warn' | 'block';

export interface ImageGateResult {
  verdict: GateVerdict;
  /** The bucket that fired, or null when the photo was accepted. */
  bucket: string | null;
  /** That bucket's probability mass. */
  score: number;
  /** A sentence for the capture screen. Null when accepted. */
  message: string | null;
}

/** What the inspector is told, per bucket. */
const BUCKET_MESSAGE: Record<string, string> = {
  person: 'This looks like a photo of a person, not a building.',
  food: 'This looks like a photo of food, not a building.',
  pet: 'This looks like a photo of an animal, not a building.',
  vehicle: 'This looks like a photo of a vehicle, not a building.',
  screen_document: 'This may be a screen or a document rather than a building.',
};

const ACCEPTED: ImageGateResult = { verdict: 'accept', bucket: null, score: 0, message: null };

let tfliteMod: TfliteModule | null | undefined;
let model: Awaited<ReturnType<TfliteModule['loadTensorflowModel']>> | null = null;
let loadFailed = false;

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

async function loadGate() {
  if (model) return model;
  if (loadFailed) return null;

  const tflite = getTflite();
  if (!tflite) {
    loadFailed = true;
    return null;
  }

  await ensureModelsLoaded();
  if (!isOptionalModelAvailable(MODEL_FILE)) {
    loadFailed = true;
    return null;
  }

  const path = modelPath(spec.model ?? MODEL_FILE);
  if (!path) {
    loadFailed = true;
    return null;
  }

  try {
    // Object form, not a bare string: react-native-fast-tflite throws
    // "Invalid source passed" on a plain path.
    model = await tflite.loadTensorflowModel({ url: path });
    return model;
  } catch (e) {
    console.warn('[ML] Image gate failed to load:', e);
    loadFailed = true;
    return null;
  }
}

function toArray(output: unknown): number[] {
  if (output instanceof Float32Array) return Array.from(output);
  if (Array.isArray(output)) {
    if (output.length > 0 && Array.isArray(output[0])) return (output[0] as number[]).map(Number);
    return output.map(Number);
  }
  return [];
}

/**
 * Judge one decoded 224x224x3 RGB tensor.
 *
 * The tensor is passed as plain 0-255 floats: this model carries its own
 * Rescaling layer, unlike the ResNet export. That is deliberate -- reimplementing
 * preprocess_input on the device is exactly where an RGB/BGR bug once lived, so
 * the gate does not repeat the arrangement.
 */
export async function evaluateImageTensor(rgb: Uint8Array): Promise<ImageGateResult> {
  if (rgb.length !== IMG_SIZE * IMG_SIZE * 3) return ACCEPTED;

  const gate = await loadGate();
  if (!gate) return ACCEPTED;

  let probs: number[];
  try {
    const input = new Float32Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) input[i] = rgb[i]!;
    probs = toArray((await gate.run([input]))[0]);
  } catch (e) {
    console.warn('[ML] Image gate inference failed:', e);
    return ACCEPTED;
  }
  if (probs.length === 0) return ACCEPTED;

  const blocking = new Set(spec.blocking ?? []);
  let fired: { bucket: string; score: number; verdict: GateVerdict } | null = null;

  for (const [bucket, indices] of Object.entries(spec.buckets ?? {})) {
    let mass = 0;
    for (const index of indices) mass += probs[index] ?? 0;

    const threshold = spec.thresholds?.[bucket];
    if (threshold == null || mass <= threshold) continue;

    const verdict: GateVerdict = blocking.has(bucket) ? 'block' : 'warn';

    // Severity first, mass only as a tie-break *within* a severity. Comparing
    // mass across severities lets a confident warn displace a block: a person
    // holding a document scores person 0.45 (block) and screen_document 0.80
    // (warn), and the higher number would win. The photo would then be merely
    // warned about -- and predictOnDevice only drops on 'block', so a portrait
    // would reach the classifier, which is the exact failure this gate exists
    // to prevent.
    const outranks =
      !fired ||
      (verdict === 'block' && fired.verdict === 'warn') ||
      (verdict === fired.verdict && mass > fired.score);
    if (outranks) {
      fired = { bucket, score: mass, verdict };
    }
  }

  if (!fired) return ACCEPTED;
  return {
    verdict: fired.verdict,
    bucket: fired.bucket,
    score: fired.score,
    message: BUCKET_MESSAGE[fired.bucket] ?? 'This may not be a photo of a building.',
  };
}

/**
 * Judge a photo by URI, decoding it the same way the classifier will.
 *
 * Used by the capture screen, where no tensor exists yet. Returns `accept` if
 * the photo cannot be decoded -- an undecodable file is a problem for the
 * pipeline to report, not for the gate to pre-empt.
 */
export async function evaluateImageUri(uri: string): Promise<ImageGateResult> {
  try {
    const { preprocessPhotoForModel } = await import('./imagePreprocess');
    const rgb = await preprocessPhotoForModel(uri);
    return await evaluateImageTensor(rgb);
  } catch (e) {
    console.warn('[ML] Image gate could not decode photo:', e);
    return ACCEPTED;
  }
}

/** Whether the gate can actually run, for surfacing "not checked" honestly. */
export function isImageGateAvailable(): boolean {
  return !loadFailed && getTflite() != null && isOptionalModelAvailable(MODEL_FILE);
}
