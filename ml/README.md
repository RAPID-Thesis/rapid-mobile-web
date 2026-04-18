# RAPID — tabular Random Forest training

Trains two sklearn pipelines (pre-earthquake and post-earthquake) aligned with [`data_dictionary.md`](data_dictionary.md) and [`labeling_rubric.md`](labeling_rubric.md).

## Setup

```bash
cd ml
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Regenerate semi-synthetic CSVs (optional)

1. **Lay out PHIVOLCS layers** under `data/gis/data/` (all sidecar files next to each `.shp`):

   | Path | Content |
   |------|---------|
   | `data/gis/data/H_VFS_PHIVOLCS/H_VFS_ALL_PHIVOLCS_PL.shp` (+ `.dbf`, `.shx`, `.prj`, …) | Valley Fault System (lines) for `distance_to_fault_km` |
   | `data/gis/data/H_LIQ_PHIVOLCS_BUL/H_LIQ_{LOW,MOD,HIGH}_PHIVOLCS.shp` (+ sidecars) | Liquefaction bulletin polygons (optional soil override) |
   | `data/gis/data/Soil_Map_SJDM.png` | Visual reference for soil zones (not processed directly) |
   | `data/gis/data/Contour_Map_SJDM.png` | Visual reference for terrain (not processed directly) |

   SRTM elevation data is downloaded automatically on first run (~25 MB, cached in `data/gis/srtm/`).

   Details: [`data/gis/README.md`](data/gis/README.md).

2. **Run** (from `ml/`; needs **network** on first run to fetch SRTM tile + SJDM boundary via Nominatim):

```bash
python scripts/generate_synthetic_data.py --n 5000 --out-dir data
```

   Writes `data/train_pre.csv`, `data/train_post.csv`, and `data/generation_meta.json`.

## Train and export artifacts

```bash
python train_tabular_rf.py
```

Includes **RandomizedSearchCV** (50 iterations, 5-fold) for automatic hyperparameter tuning.

Outputs:

- `artifacts/rf_pre.joblib` — pipeline for labels `low` / `moderate` / `high`
- `artifacts/rf_post.joblib` — pipeline for labels `SAFE` / `RESTRICTED` / `UNSAFE`
- `artifacts/rf_pre_metadata.json` / `rf_post_metadata.json` — sklearn version, best hyperparameters, CV/test F1, feature importances

## Feature columns

See [`data_dictionary.md`](data_dictionary.md) for the full list. Key real-data features:

- `distance_to_fault_km` — from PHIVOLCS Valley Fault System shapefile
- `elevation_m` / `slope_deg` — from SRTM 30 m DEM (auto-downloaded)
- `soil_classification` — mapped from SJDM government soil map elevation zones
- `building_age` — explicit numeric feature (`2026 - year_built`)

## Limitations

Semi-synthetic labels are rule-based (see `scripts/generate_synthetic_data.py`). Report domain shift and engineer override in thesis/product docs when moving to production inference.
