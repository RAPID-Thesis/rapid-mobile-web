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

   Details: [`data/gis/README.md`](data/gis/README.md).

2. **Run** (from `ml/`; needs **network** on first run to fetch the San Jose del Monte study polygon via Nominatim, unless you pass `--boundary path/to/study_area.geojson`):

```bash
python scripts/generate_synthetic_data.py --n 5000 --out-dir data
```

Writes `data/train_pre.csv`, `data/train_post.csv`, and `data/generation_meta.json`.

## Train and export artifacts

```bash
python train_tabular_rf.py
```

Outputs:

- `artifacts/rf_pre.joblib` — pipeline for labels `low` / `moderate` / `high`
- `artifacts/rf_post.joblib` — pipeline for labels `SAFE` / `RESTRICTED` / `UNSAFE`
- `artifacts/rf_pre_metadata.json` / `rf_post_metadata.json` — sklearn version, classes, CV/test F1, feature importances

Replace `data/train_pre.csv` and `data/train_post.csv` with real or pilot data when available; keep the same columns as in the data dictionary.

## Limitations

Semi-synthetic labels are rule-based (see `scripts/generate_synthetic_data.py`). Report domain shift and engineer override in thesis/product docs when moving to production inference.
