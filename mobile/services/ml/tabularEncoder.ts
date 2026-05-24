import type { TabularFeatureRow } from './tabularFeatures';

export interface RfPreprocessorSpec {
  numeric_features: string[];
  numeric_medians: number[];
  categorical_features: string[];
  one_hot: { column: string; categories: string[] }[];
  feature_names: string[];
  input_dim: number;
}

function imputeNumeric(row: TabularFeatureRow, spec: RfPreprocessorSpec): number[] {
  const raw = row as unknown as Record<string, number | null>;
  return spec.numeric_features.map((col, i) => {
    const v = raw[col];
    if (v == null || !Number.isFinite(v)) return spec.numeric_medians[i] ?? 0;
    return v;
  });
}

function imputeCategorical(value: string | null | undefined): string {
  if (!value || !value.trim()) return 'unknown';
  return value.trim();
}

/** Encode tabular row to sklearn ColumnTransformer output (matches export_mobile_models.py). */
export function encodeTabularForOnnx(
  row: TabularFeatureRow,
  spec: RfPreprocessorSpec
): Float32Array {
  const out = new Float32Array(spec.input_dim);
  let offset = 0;

  const numeric = imputeNumeric(row, spec);
  for (const v of numeric) {
    out[offset++] = v;
  }

  const raw = row as unknown as Record<string, string | null | undefined>;
  for (const block of spec.one_hot) {
    const val = imputeCategorical(raw[block.column]);
    for (const cat of block.categories) {
      out[offset++] = val === cat ? 1 : 0;
    }
  }

  return out;
}
