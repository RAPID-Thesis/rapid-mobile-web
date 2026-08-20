# Label rubrics

- [Image severity rubric (ResNet50)](#image-severity-rubric-resnet50)
- [Tabular label rubric (Random Forest)](#tabular-label-rubric-random-forest)

---

# Image severity rubric (ResNet50)

## Why this rubric exists

The original image dataset was labeled **by source, not by severity**: `low` was the *Negative*
half of the Mendeley Concrete Crack set, `moderate` was its *Positive* half, and `high` was a
separate Roboflow export at a different resolution. The three classes were therefore separable
by image statistics alone, which is why validation macro-F1 reached 0.9975 while field accuracy
was poor. Re-labeling against this rubric replaces "which dataset is this from" with "how bad is
the damage".

Label the **damage visible in the photo**, not the building it might belong to. Judge only what
is in frame — do not infer severity from context you cannot see.

## Classes

Calibrated against the worked examples in `ml/data/relabel/reference/`, which are the
authoritative standard. Where prose and example disagree, **the example wins**.

| Class (pre-EQ / post-EQ) | Criteria |
|---|---|
| **low** / SAFE | Sound surface, **or** a *single isolated* hairline crack (under ~1 mm) in plaster, paint, or a finish coat. Staining, dirt, moss, or worn paint alone is `low`. Nothing broken away. |
| **moderate** / RESTRICTED | *Multiple* cracks, or **patterned cracking** — X-shaped, diagonal, or map/grid networks — even when the individual cracks are hairline. Also clearly visible cracks roughly 1–5 mm. Nothing has broken away, no steel showing, nothing out of position. |
| **high** / UNSAFE | Material has **broken away** — spalling, crushing, or a missing chunk of plaster or concrete — with or without steel showing. Also: any exposed, bent, rusted, or buckled reinforcement; cracks wider than ~5 mm; leaning, permanent offset, separation between elements; partial or full collapse. |

## The decisive test

**Has material broken away from the surface?**

- Nothing broken away → `low` or `moderate`, decided by whether cracking is *isolated* (low) or
  *multiple / patterned* (moderate).
- Something broken away → `high`, whether or not reinforcement is visible.

Two consequences worth stating plainly, because they are where the first labeling round went
wrong in both directions:

- **Spalling without visible rebar is still `high`.** Loss of section is the concern; whether the
  camera happens to catch a bar is not. (Example `HIGH_4`.)
- **X-shaped or grid hairline cracking is `moderate`, not `low`.** A pattern of fine cracks
  indicates shear or distributed distress, unlike a single shrinkage crack. (Example
  `MODERATE_1` versus `LOW_1`.)

## Edge cases

- **Can't tell / too blurry / subject unclear** → label `skip`. Do not guess; a wrong label is
  worse than a dropped image. These are recorded and excluded from training.
- **Not a building** (screenshots, documents, unrelated objects) → label `junk`. Four such
  screenshots were found in the original `high` class and are now in `ml/data/images/_quarantine/`.
- **Multiple severities in one frame** → label the **most severe** damage visible, matching how an
  inspector would post the structure.
- **Extreme close-up with no context** (a bare crack filling the frame) → judge by crack width
  relative to visible surface texture; if width is genuinely unreadable, use `skip`.
- **Low-texture / washed-out images** are flagged `low_texture=1` by
  [`scripts/dedupe_images.py`](scripts/dedupe_images.py). They are legitimate images, just faint —
  label them normally, but prefer `skip` over a guess.

## Process notes

- Label **one row per `group_id`**, not per file. Near-duplicate copies of one photo share a
  group and inherit the label, which is also what keeps them from being split across train/val.
- Priority order: **Pool C first** (the Roboflow set — the only source of genuinely severe damage
  in the corpus), then a stratified sample of Pool B, then a spot-check of Pool A.
- Expect much of Pool B (the *Positive* crack set) to be `low`, not `moderate` — most of those
  images are hairline surface cracks. This is the single biggest correction to the old labels.

---

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
