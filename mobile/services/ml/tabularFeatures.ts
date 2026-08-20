import type { AssessmentPhase, BuildingUse } from '../../types';
import type { OfflineStructuralForm } from '../localPredict';
import { sampleGeoFeatures } from './geoLookup';

/** Mirrors backend ml_fusion_engine mapping tables. */
const MATERIAL_MAP: Record<string, string> = {
  'concrete hollow block (chb)': 'concrete',
  'reinforced concrete (rc)': 'concrete',
  'light wood frame': 'wood',
  'steel frame': 'mixed',
  'mixed use': 'mixed',
  concrete: 'concrete',
  wood: 'wood',
  mixed: 'mixed',
};

const STRUCTURAL_SYSTEM_MAP: Record<string, string> = {
  'moment resisting frame': 'moment_frame',
  'shear wall system': 'shear_wall',
  // Must match _STRUCTURAL_SYSTEM_MAP in backend/app/services/ml_fusion_engine.py.
  // Previously collapsed to 'unknown', discarding the strongest vulnerability signal an
  // inspector can record; the category now exists in the tabular training data.
  'unreinforced masonry': 'unreinforced_masonry',
  unreinforced_masonry: 'unreinforced_masonry',
  'braced frame': 'braced_frame',
  moment_frame: 'moment_frame',
  shear_wall: 'shear_wall',
  wood_frame: 'wood_frame',
  braced_frame: 'braced_frame',
  unknown: 'unknown',
};

const SOIL_MAP: Record<string, string> = {
  'type a/b - hard rock': 'B',
  'type c - dense soil': 'C',
  'type d - stiff soil': 'D',
  'type e/f - soft/vulnerable': 'E',
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
  f: 'F',
};

const FOUNDATION_MAP: Record<string, string> = {
  shallow: 'shallow',
  deep: 'deep',
  mat: 'mat',
  pile: 'deep',
  raft: 'mat',
  unknown: 'unknown',
};

function norm(value: string | null | undefined, mapping: Record<string, string>, fallback: string): string {
  if (!value) return fallback;
  return mapping[value.trim().toLowerCase()] ?? fallback;
}

export interface TabularFeatureRow {
  year_built: number | null;
  building_age: number | null;
  number_of_stories: number;
  building_use: string;
  soil_classification: string;
  distance_to_fault_km: number | null;
  elevation_m: number | null;
  slope_deg: number | null;
  previous_retrofit_as_int: number;
  structural_system: string;
  foundation_type: string;
  material: string;
}

/** RF ONNX input row — matches ml/scripts/export_mobile_models.py SAMPLE_TABULAR_ROW. */
export function buildTabularFeatureRow(params: {
  phase: AssessmentPhase;
  buildingUse: BuildingUse;
  yearBuilt: number | null;
  numberOfStories: number;
  structuralData: OfflineStructuralForm;
  latitude: number | null;
  longitude: number | null;
}): TabularFeatureRow {
  const { structuralData, yearBuilt, numberOfStories, buildingUse, latitude, longitude } = params;

  let elevation_m: number | null = null;
  let slope_deg: number | null = null;
  let distance_to_fault_km: number | null = null;

  if (latitude != null && longitude != null && latitude !== 0 && longitude !== 0) {
    const geo = sampleGeoFeatures(latitude, longitude);
    elevation_m = geo.elevation_m;
    slope_deg = geo.slope_deg;
    distance_to_fault_km = geo.distance_to_fault_km;
  }

  const building_age = yearBuilt != null ? new Date().getFullYear() - yearBuilt : null;

  return {
    year_built: yearBuilt,
    building_age,
    number_of_stories: numberOfStories,
    building_use: buildingUse.toLowerCase(),
    soil_classification: norm(structuralData.soilClass, SOIL_MAP, 'D'),
    distance_to_fault_km,
    elevation_m,
    slope_deg,
    previous_retrofit_as_int: 0,
    structural_system: norm(structuralData.structuralSystem, STRUCTURAL_SYSTEM_MAP, 'unknown'),
    foundation_type: 'unknown',
    material: norm(structuralData.primaryMaterial, MATERIAL_MAP, 'mixed'),
  };
}

/** Float32 matrix [1, n_features] in export column order for ONNX Runtime. */
export function tabularRowToOnnxMatrix(row: TabularFeatureRow): Float32Array {
  const values: (number | null)[] = [
    row.year_built,
    row.building_age,
    row.number_of_stories,
    row.distance_to_fault_km,
    row.elevation_m,
    row.slope_deg,
    row.previous_retrofit_as_int,
  ];

  // Categorical columns encoded as indices for a simplified ONNX feed when pipeline uses strings.
  // Full ONNX pipeline from skl2onnx accepts string categoricals via separate inputs; we store
  // raw strings in parallel for the ONNX runner.
  const numeric = values.map((v) => (v == null || !Number.isFinite(v) ? NaN : v));
  return new Float32Array(numeric);
}

export function tabularRowForOnnx(row: TabularFeatureRow): Record<string, string | number | null> {
  return { ...row };
}
