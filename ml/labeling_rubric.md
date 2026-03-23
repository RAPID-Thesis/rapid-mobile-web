# Tabular label rubric (Random Forest)

## Modeling choice

Two separate **Random Forest classifiers** are trained and exported:

| Artifact      | Phase            | Label set                          | Alignment                          |
|---------------|------------------|------------------------------------|------------------------------------|
| `rf_pre.joblib`  | Pre-earthquake   | `low`, `moderate`, `high`          | FEMA P-154–style seismic vulnerability |
| `rf_post.joblib` | Post-earthquake  | `SAFE`, `RESTRICTED`, `UNSAFE`     | ATC-20–style post-event safety     |

This keeps a single 3-class target per model and matches the RAPID MVP mocks and PRD.

## Pre-earthquake labels (`low` / `moderate` / `high`)

Semantic intent: **predicted vulnerability** from structural and site metadata (no image).

- **low** — Favorable combination of newer construction, fewer stories, stabler soil (e.g. A/B), greater distance to mapped fault, retrofit where relevant, and more ductile typologies/materials.
- **moderate** — Mixed indicators; typical stock requiring routine RVS follow-up.
- **high** — Unfavorable combination (e.g. older, taller, weaker soil classes, closer to fault, no retrofit, vulnerable structural system/material).

These are **not** official government classifications unless replaced by real RDANA-derived labels.

## Post-earthquake labels (`SAFE` / `RESTRICTED` / `UNSAFE`)

Semantic intent: **triaged safety state** consistent with rapid screening after an event (tabular-only proxy used for semi-synthetic training).

- **SAFE** — Structure likely fit for normal occupancy pending policy; strongest tabular indicators of stability.
- **RESTRICTED** — Limited entry or use until further inspection; intermediate tabular risk.
- **UNSAFE** — Strong tabular indicators of collapse risk or life-safety concern; evacuation / no entry until engineer review.

## Semi-synthetic training data

Rows in `data/train_pre.csv` and `data/train_post.csv` produced by [`scripts/generate_synthetic_data.py`](scripts/generate_synthetic_data.py) use **real PHIVOLCS GIS** under `data/gis/data/` (Valley Fault System for `distance_to_fault_km`; optional liquefaction bulletin polygons for `soil_classification` / `liquefaction_tier`) plus a **documented weighted score** for the remaining synthetic fields. Labels are assigned by score tertiles. **Replace with pilot or official labels** when available; engineer override in the product remains the safety backstop (PRD §4.7).
