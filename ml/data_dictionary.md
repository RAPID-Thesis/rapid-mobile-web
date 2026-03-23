# Tabular dataset dictionary

CSV files align with API-facing building and assessment fields ([`BuildingCreate`](../backend/app/schemas.py) and `structural_data` on assessments).

## Files

| File               | Rows   | Target column | Label values                          |
|--------------------|--------|---------------|---------------------------------------|
| `data/train_pre.csv`  | Synthetic + optional real | `label`       | `low`, `moderate`, `high`             |
| `data/train_post.csv` | Synthetic + optional real | `label`       | `SAFE`, `RESTRICTED`, `UNSAFE`        |

## Features (columns)

| Column                 | Type    | Allowed / notes |
|------------------------|---------|------------------|
| `year_built`           | int     | Optional; missing allowed (imputed median in training). |
| `number_of_stories`    | int     | ≥ 1 |
| `building_use`         | string  | `residential`, `commercial`, `institutional`, `industrial`, `mixed` |
| `soil_classification`  | string  | `A` … `F` (NEHRP-style site class) |
| `distance_to_fault_km` | float   | ≥ 0; km to nearest **PHIVOLCS Valley Fault System** segment (`H_VFS_ALL_PHIVOLCS_PL.shp`), computed in projected CRS |
| `liquefaction_tier` | string | `LOW` / `MOD` / `HIGH` if inside PHIVOLCS liquefaction bulletin polygons; empty if outside (see `ml/data/gis/README.md`) |
| *(generation)* | — | Building coordinates are drawn inside **San Jose del Monte, Bulacan** (Nominatim polygon or `--boundary` GeoJSON), matching the project study area. |
| `previous_retrofit`    | bool    | `True` / `False` |
| `structural_system`    | string  | Coarse buckets, e.g. `moment_frame`, `shear_wall`, `braced_frame`, `wood_frame`, `unknown` |
| `foundation_type`      | string  | e.g. `shallow`, `deep`, `mat`, `unknown` |
| `material`             | string  | From assessment `structural_data`: `concrete`, `wood`, `mixed` |
| `label`                | string  | Class to predict (see [labeling_rubric.md](labeling_rubric.md)) |

## Inference parity

Training uses a single sklearn `Pipeline` (imputation + `OneHotEncoder` + `RandomForestClassifier`). Production must send the **same keys** and value domains as in this dictionary.
