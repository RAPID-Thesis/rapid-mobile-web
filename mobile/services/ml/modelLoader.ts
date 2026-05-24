import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

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

const MODEL_NAMES = [
  'resnet50_pre.tflite',
  'resnet50_post.tflite',
  'rf_pre.onnx',
  'rf_post.onnx',
] as const;

let cacheDir: string | null = null;
let manifest: MobileManifest | null = null;
let initPromise: Promise<boolean> | null = null;

export async function ensureModelsLoaded(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = initModels();
  return initPromise;
}

async function initModels(): Promise<boolean> {
  const base = `${FileSystem.documentDirectory}rapid_ml/`;
  try {
    await FileSystem.makeDirectoryAsync(base, { intermediates: true });

    if (!(await cacheHasCompleteModels(base))) {
      await tryStageFromAssetBundle(base);
    }

    const manifestPath = base + 'mobile_manifest.json';
    const manifestInfo = await FileSystem.getInfoAsync(manifestPath);
    if (!manifestInfo.exists) return false;

    manifest = JSON.parse(await FileSystem.readAsStringAsync(manifestPath)) as MobileManifest;
    if (manifest.bundled === false) return false;
    if (!(await cacheHasCompleteModels(base))) return false;

    cacheDir = base;
    return true;
  } catch (e) {
    console.warn('[ML] Model init failed:', e);
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
 * After `export_mobile_models.py --copy-to-mobile`, model binaries live under
 * mobile/assets/models/. Metro bundles them via assetBundlePatterns; at runtime
 * we copy from the manifest asset's directory when sibling model files exist.
 */
async function tryStageFromAssetBundle(base: string): Promise<void> {
  const manifestAsset = Asset.fromModule(require('../../assets/models/mobile_manifest.json'));
  await manifestAsset.downloadAsync();
  const manifestSrc = manifestAsset.localUri ?? manifestAsset.uri;
  if (!manifestSrc) return;

  const parsed = JSON.parse(await FileSystem.readAsStringAsync(manifestSrc)) as MobileManifest;
  await FileSystem.copyAsync({ from: manifestSrc, to: base + 'mobile_manifest.json' });
  if (parsed.bundled === false) return;

  const dir = manifestSrc.replace(/mobile_manifest\.json$/i, '');
  for (const name of MODEL_NAMES) {
    const src = dir + name;
    const info = await FileSystem.getInfoAsync(src);
    if (info.exists) {
      await FileSystem.copyAsync({ from: src, to: base + name });
    }
  }
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
