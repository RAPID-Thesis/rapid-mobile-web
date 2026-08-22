import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

// `.json` is a Metro *source* extension, so this import yields the parsed object
// directly rather than an asset handle -- no file IO needed to read it.
import bundledManifest from '../../assets/models/mobile_manifest.json';

export interface RfBranchManifest {
  file: string;
  classifier_only?: boolean;
  preprocessor?: {
    numeric_features: string[];
    numeric_medians: number[];
    categorical_features: string[];
    one_hot: { column: string; categories: string[] }[];
    feature_names: string[];
    input_dim: number;
  };
}

export interface MobileManifest {
  bundled?: boolean;
  exported_at_utc?: string;
  fusion: { image_weight: number; tabular_weight: number };
  pre: { classes: string[]; resnet: { file: string }; rf: RfBranchManifest };
  post: { classes: string[]; resnet: { file: string }; rf: RfBranchManifest };
}

/**
 * Each model is require()d so Metro registers it as an asset and ships it in the
 * APK with a resolvable id. This is the part that has to be static -- a computed
 * path cannot be bundled, which is why deriving sibling paths from the manifest's
 * location silently found nothing in release builds and every prediction fell
 * back to the heuristic.
 */
const MODEL_MODULES: Record<string, number> = {
  'resnet50_pre.tflite': require('../../assets/models/resnet50_pre.tflite'),
  'resnet50_post.tflite': require('../../assets/models/resnet50_post.tflite'),
  'rf_pre.onnx': require('../../assets/models/rf_pre.onnx'),
  'rf_post.onnx': require('../../assets/models/rf_post.onnx'),
};

const MODEL_NAMES = Object.keys(MODEL_MODULES) as readonly string[];

let cacheDir: string | null = null;
let manifest: MobileManifest | null = null;
let initPromise: Promise<boolean> | null = null;
let loadError: string | null = null;

/** Why on-device inference is unavailable, for surfacing instead of silently degrading. */
export function getModelLoadError(): string | null {
  return loadError;
}

export async function ensureModelsLoaded(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = initModels();
  return initPromise;
}

async function initModels(): Promise<boolean> {
  const base = `${FileSystem.documentDirectory}rapid_ml/`;
  try {
    loadError = null;
    await FileSystem.makeDirectoryAsync(base, { intermediates: true });

    const parsed = bundledManifest as unknown as MobileManifest;
    if (parsed.bundled === false) {
      loadError = 'Manifest says models are not bundled in this build.';
      return false;
    }

    if (!(await cacheHasCompleteModels(base))) {
      await stageBundledModels(base);
    }

    const missing = await missingModels(base);
    if (missing.length > 0) {
      loadError = `Bundled model file(s) missing after staging: ${missing.join(', ')}`;
      return false;
    }

    manifest = parsed;
    cacheDir = base;
    return true;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
    console.warn('[ML] Model init failed:', loadError);
    manifest = null;
    cacheDir = null;
    return false;
  }
}

async function cacheHasCompleteModels(base: string): Promise<boolean> {
  for (const name of MODEL_NAMES) {
    const f = await FileSystem.getInfoAsync(base + name);
    if (!f.exists || (f.size ?? 0) < 1024) return false;
  }
  return true;
}

/**
 * Copy each bundled model out of the APK and into the document directory, because
 * the TFLite and ONNX runtimes both need a real filesystem path rather than an
 * asset handle.
 *
 * Staging is one-time: cacheHasCompleteModels() short-circuits it on later runs.
 */
async function stageBundledModels(base: string): Promise<void> {
  for (const name of MODEL_NAMES) {
    const target = base + name;
    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists && (existing.size ?? 0) >= 1024) continue;

    const asset = Asset.fromModule(MODEL_MODULES[name]);
    await asset.downloadAsync();
    const src = asset.localUri ?? asset.uri;
    if (!src) throw new Error(`Could not resolve bundled asset for ${name}`);
    await FileSystem.copyAsync({ from: src, to: target });
  }
}

async function missingModels(base: string): Promise<string[]> {
  const missing: string[] = [];
  for (const name of MODEL_NAMES) {
    const f = await FileSystem.getInfoAsync(base + name);
    if (!f.exists || (f.size ?? 0) < 1024) missing.push(name);
  }
  return missing;
}

export function getMobileManifest(): MobileManifest | null {
  return manifest;
}

export function modelPath(filename: string): string | null {
  if (!cacheDir) return null;
  return cacheDir + filename;
}

export function areModelsAvailable(): boolean {
  return manifest != null && cacheDir != null;
}

export function resetModelCacheForTests(): void {
  initPromise = null;
  manifest = null;
  cacheDir = null;
}

export function androidAssetModelUri(filename: string): string | null {
  if (Platform.OS !== 'android') return null;
  return `file:///android_asset/${filename}`;
}
