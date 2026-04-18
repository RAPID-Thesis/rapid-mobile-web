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
| `latitude`             | float   | WGS-84; points sampled inside San Jose del Monte, Bulacan boundary |
| `longitude`            | float   | WGS-84 |
| `distance_to_fault_km` | float   | ≥ 0; km to nearest **PHIVOLCS Valley Fault System** segment (`H_VFS_ALL_PHIVOLCS_PL.shp`), projected CRS EPSG:32651 |
| `elevation_m`          | float   | Meters above sea level from **SRTM 30 m DEM** (tile N14E121); range in SJDM ≈ 20–275 m |
| `slope_deg`            | float   | Terrain slope in degrees derived from the SRTM DEM gradient |
| `sjdm_soil_name`       | string  | Soil type from the **SJDM Government Soil Map**: `Novaliches Clay Loam`, `Novaliches Loam`, or `Sibul Clay` — assigned by elevation band |
| `liquefaction_tier`    | string  | `LOW` / `MOD` / `HIGH` if inside PHIVOLCS liquefaction bulletin polygons; empty if outside |
| `year_built`           | int     | Optional; missing allowed (imputed median in training) |
| `building_age`         | float   | `2026 - year_built`; NaN when `year_built` is missing |
| `number_of_stories`    | int     | ≥ 1 |
| `material`             | string  | `concrete`, `wood`, `mixed` |
| `building_use`         | string  | `residential`, `commercial`, `institutional`, `industrial`, `mixed` |
| `soil_classification`  | string  | NEHRP site class `A`–`F`; derived from `sjdm_soil_name` elevation zones, overridden by liquefaction tier when applicable |
| `previous_retrofit`    | bool    | `True` / `False` |
| `structural_system`    | string  | `moment_frame`, `shear_wall`, `braced_frame`, `wood_frame`, `unknown` |
| `foundation_type`      | string  | `shallow`, `deep`, `mat`, `unknown` |
| `label`                | string  | Class to predict (see [labeling_rubric.md](labeling_rubric.md)) |
| `assessed_damage`      | string  | Same as `label` (kept for API compatibility) |

## GIS data sources

| Data | Source | Used for |
|------|--------|----------|
| Valley Fault System | PHIVOLCS shapefile | `distance_to_fault_km` |
| Liquefaction Bulletin | PHIVOLCS shapefiles (LOW / MOD / HIGH) | Optional `soil_classification` override |
| Elevation & Slope | SRTM 1-arc-second DEM (AWS terrain tiles) | `elevation_m`, `slope_deg` |
| Soil type zones | SJDM Government Soil Map (PNG, digitized via elevation bands) | `sjdm_soil_name` → `soil_classification` |

## Inference parity

Training uses a single sklearn `Pipeline` (imputation + `OneHotEncoder` + `RandomForestClassifier`). Production must send the **same keys** and value domains as in this dictionary.
