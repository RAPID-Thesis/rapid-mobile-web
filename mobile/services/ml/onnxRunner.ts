import { NativeModules, Platform } from 'react-native';

import { classesForPhase, phaseKey } from './constants';
import type { BranchPrediction } from './fusion';
import { getMobileManifest, modelPath } from './modelLoader';
import { encodeTabularForOnnx } from './tabularEncoder';
import type { TabularFeatureRow } from './tabularFeatures';

type OrtModule = {
  InferenceSession: {
    create: (path: string) => Promise<{
      run: (feeds: Record<string, unknown>) => Promise<Record<string, unknown>>;
      inputNames: string[];
      outputNames: string[];
    }>;
  };
  Tensor: new (type: string, data: ArrayLike<number>, dims: number[]) => unknown;
};

let ortMod: OrtModule | null | undefined;

function getOrt(): OrtModule | null {
  if (ortMod !== undefined) return ortMod;
  if (Platform.OS !== 'android') {
    ortMod = null;
    return null;
  }
  // `onnxruntime-react-native` calls `NativeModules.Onnxruntime.install()` at module
  // scope. When the native module is not linked that throws a TypeError *inside*
  // metroRequire, and Metro reports an outermost require failure through
  // `ErrorUtils.reportFatalError` rather than rethrowing -- which crashes the app
  // instead of unwinding into the catch below. Probing the native module the same way
  // the library does keeps a missing native build on the heuristic fallback path.
  if (nativeOrtModule() == null && !ortApiInstalled()) {
    console.warn('[ML] Onnxruntime native module not linked; ONNX branch unavailable');
    ortMod = null;
    return null;
  }
  try {
    ortMod = require('onnxruntime-react-native') as OrtModule;
  } catch (e) {
    console.warn('[ML] failed to load onnxruntime-react-native:', e);
    ortMod = null;
  }
  return ortMod;
}

function nativeOrtModule(): unknown {
  return (NativeModules as Record<string, unknown>).Onnxruntime ?? null;
}

/** The library skips `install()` when the JSI binding is already on the global. */
function ortApiInstalled(): boolean {
  return typeof (globalThis as { OrtApi?: unknown }).OrtApi !== 'undefined';
}

const sessionCache: Partial<Record<'pre' | 'post', Awaited<ReturnType<OrtModule['InferenceSession']['create']>>>> =
  {};

async function loadSession(phase: 'pre' | 'post') {
  if (sessionCache[phase]) return sessionCache[phase]!;
  const ort = getOrt();
  if (!ort) throw new Error('ONNX Runtime not available');

  const manifest = getMobileManifest();
  const file = manifest?.[phase]?.rf?.file ?? `rf_${phase}.onnx`;
  const path = modelPath(file);
  if (!path) throw new Error('ONNX model path unavailable');

  sessionCache[phase] = await ort.InferenceSession.create(path);
  return sessionCache[phase]!;
}

function buildFeeds(
  session: Awaited<ReturnType<OrtModule['InferenceSession']['create']>>,
  row: TabularFeatureRow,
  ort: OrtModule,
  phase: 'pre' | 'post'
): Record<string, unknown> {
  const manifest = getMobileManifest();
  const spec = manifest?.[phase]?.rf?.preprocessor;
  if (!spec) {
    throw new Error('RF preprocessor spec missing from mobile_manifest.json');
  }

  const encoded = encodeTabularForOnnx(row, spec);
  const name = session.inputNames[0]!;
  return {
    [name]: new ort.Tensor('float32', encoded, [1, encoded.length]),
  };
}

function extractProbs(result: Record<string, unknown>, classes: readonly string[]): number[] {
  for (const v of Object.values(result)) {
    if (v && typeof v === 'object' && 'data' in v) {
      const data = (v as { data: Float32Array | number[] }).data;
      const arr = Array.from(data as ArrayLike<number>);
      if (arr.length >= classes.length) {
        return arr.slice(0, classes.length);
      }
    }
  }
  return classes.map(() => 1 / classes.length);
}

export async function runRfOnnx(params: {
  phase: string;
  row: TabularFeatureRow;
}): Promise<BranchPrediction> {
  const pk = phaseKey(params.phase);
  const classes = classesForPhase(params.phase);
  const ort = getOrt();
  if (!ort) throw new Error('ONNX Runtime not available');

  const session = await loadSession(pk);
  const feeds = buildFeeds(session, params.row, ort, pk);
  const result = await session.run(feeds);
  const vec = extractProbs(result, classes);

  const probabilities: Record<string, number> = {};
  let label = classes[0]!;
  let confidence = 0;
  classes.forEach((c, i) => {
    const p = vec[i] ?? 0;
    probabilities[c] = p;
    if (p > confidence) {
      confidence = p;
      label = c;
    }
  });

  return { label, confidence, probabilities };
}

export function isOnnxAvailable(): boolean {
  return getOrt() != null && Platform.OS === 'android';
}
