# RAPID — Next Steps After Model Training

Both AI models are trained and exported to `ml/artifacts/`. This guide walks through
everything left to do before the full system is demo-ready and thesis-defensible.

---

## Where You Are Now

| Artifact | Status | F1 Score |
|---|---|---|
| `artifacts/rf_pre.joblib` | ✅ Trained | 0.849 (pre-EQ) |
| `artifacts/rf_post.joblib` | ✅ Trained | 0.853 (post-EQ) |
| `artifacts/resnet50_pre.keras` | ✅ Trained | 0.998 (pre-EQ) |
| `artifacts/resnet50_post.keras` | ✅ Trained | 0.998 (post-EQ) |
| `backend/app/services/ml_fusion_engine.py` | ❌ Placeholder only | — |
| `/ai/predict/*` endpoints | ❌ Not implemented | — |
| Mobile camera guide | ❌ Not implemented | — |

---

## Step 1 — Implement the ML Fusion Engine

`backend/app/services/ml_fusion_engine.py` is currently a placeholder that just sleeps.
This is the core of the entire AI pipeline and needs to be replaced with real inference.

### What it needs to do

```
1. Receive: image bytes (1–4 photos) + structural form fields
2. Run ResNet50 on each image, average probabilities across photos
3. Run Random Forest on the structural fields
4. Fuse both probability vectors with weighted averaging
5. Return: final label, confidence, per-model probabilities, RF feature importance
```

### Fusion formula (from PRD §4.3)

```python
# Weighted average of probability vectors (both must be same 3-class order)
IMAGE_WEIGHT = 0.45
TABULAR_WEIGHT = 0.55  # RF is more reliable for structured data

fused_probs = IMAGE_WEIGHT * image_probs + TABULAR_WEIGHT * tabular_probs
final_label = class_names[argmax(fused_probs)]
confidence = max(fused_probs)
```

The weights are configurable — start 45/55 favoring tabular since RF was trained on
real GIS data (fault lines, elevation, soil). Swap weights if photo quality is high.

### Graceful degradation

The fusion engine must handle missing inputs (PRD §4.3):

- **Image missing** (form-only): use 100% RF prediction.
- **Form missing** (image-only): use 100% ResNet50 prediction.
- **Both present**: weighted fusion above.

### Tabular feature preparation

The RF pipeline expects these exact column names from `ml/data_dictionary.md`.
You need to map the `AssessmentCreate` schema fields to the RF feature columns:

| RF feature column | `AssessmentCreate` / `BuildingCreate` source |
|---|---|
| `year_built` | `building.year_built` |
| `building_age` | `2026 - building.year_built` |
| `number_of_stories` | `building.number_of_stories` |
| `building_use` | `building.building_use` (BuildingUse enum) |
| `soil_classification` | `structural_data.soil_classification` |
| `distance_to_fault_km` | `structural_data.distance_to_fault_km` |
| `elevation_m` | `structural_data.elevation_m` *(add to schema)* |
| `slope_deg` | `structural_data.slope_deg` *(add to schema)* |
| `previous_retrofit` | `structural_data.previous_retrofit` |
| `structural_system` | `structural_data.structural_system` |
| `foundation_type` | `structural_data.foundation_type` |
| `material` | `structural_data.material` |

> **Note:** `elevation_m` and `slope_deg` are new features added during training.
> You need to add them to the `AssessmentCreate` schema in `backend/app/schemas.py`
> and to the mobile form — or auto-populate them from GPS coordinates via the
> SRTM tile that is already cached at `ml/data/gis/srtm/N14E121.hgt`.

### Image preprocessing for inference

Before passing a field photo to ResNet50, apply these transforms:

```python
# 1. Fix EXIF rotation (phone photos are often stored sideways)
from PIL import Image, ImageOps
img = ImageOps.exif_transpose(Image.open(path).convert("RGB"))

# 2. Center-crop to square (don't stretch — distortion hurts crack detection)
w, h = img.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
img = img.crop((left, top, left + side, top + side))

# 3. Resize to 224x224
img = img.resize((224, 224), Image.BILINEAR)

# 4. Convert to numpy array (ResNet50 preprocessing applied inside the model graph)
import numpy as np
arr = np.array(img)  # shape: (224, 224, 3), dtype uint8
```

---

## Step 2 — Wire Up the FastAPI Endpoints

`backend/app/main.py` already has the assessment submission routes. You need to add
three AI-specific endpoints (from PRD §11):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/ai/predict/image` | ResNet50 only |
| `POST` | `/ai/predict/tabular` | Random Forest only |
| `POST` | `/ai/predict/fused` | Full late fusion |

The `/ai/predict/fused` route is the primary one called after an assessment is
submitted. The other two are useful for debugging individual branches.

The existing `process_assessment()` background task in `ml_fusion_engine.py` should
be upgraded to call the fused endpoint after a field submission is synced.

---

## Step 3 — Add `elevation_m` and `slope_deg` to the Assessment Form

The RF model was retrained with these two new features and depends on them. Two options:

**Option A (recommended): Auto-populate from GPS.**
The mobile app already captures GPS coordinates (PRD §4.5 — "Auto-fills GPS coordinates
from device location"). At submission time, look up elevation and slope from the SRTM
tile that is cached in `ml/data/gis/srtm/N14E121.hgt` — or call an elevation API
(e.g., `https://api.open-elevation.com`) as a fallback for buildings outside SJDM.

**Option B: Manual field in the assessment form.**
Add `elevation_m` (number input, meters) and `slope_deg` (number input, degrees) to
the FEMA P-154 checklist. Both values would be visible in topographic maps and Google
Earth — a trained inspector can estimate them.

The RF pipeline's `SimpleImputer(strategy="median")` will fill in missing values
using the training-set median if the field is left blank, so this won't break inference.

---

## Step 4 — Mobile App: Implement the Smart Framing Guide (PRD §4.4)

This is the single biggest factor for real-world ResNet50 accuracy. Without it,
field photos will be inconsistently framed and blurry, hurting the model.

### Minimum implementation (for MVP demo)

1. **4-step capture flow**: front → oblique corner → damage close-up → foundation.
   Show a silhouette overlay for each step indicating where the building should sit
   in the frame.

2. **Blur detection** (pre-upload check, fully offline):
   Compute the variance of the Laplacian of the grayscale image. If below ~100,
   warn "Photo is blurry — retake?"

3. **Tilt warning**: use the device's gyroscope. Warn if the camera is tilted > 15°
   from horizontal.

4. **Minimum resolution check**: reject images below 800×800 pixels.

5. **Checklist UI**: show four checkboxes (front / side / damage / foundation),
   require at least 2 of 4 before allowing submission (PRD §4.4 minimum is 2).

---

## Step 5 — Implement the Action Planning (Gemini API) (PRD §4.8)

After the fused classification is computed, send it to the Gemini API to generate
context-aware action recommendations. This is a P1 feature in the PRD but is
straightforward to add once Step 1 is working.

```
Inputs:  final_label, confidence, phase (pre/post), building metadata
Output:  numbered action items with priority levels, professional disclaimer

Fallback: if Gemini API is unavailable, return template-based recommendations
          keyed on label + phase (keep templates in a JSON file)
```

---

## Step 6 — Push ML Artifacts to GitHub

The `.joblib` and `.keras` model files are large binaries — keep them out of Git.

### What to add to `.gitignore`

```gitignore
# Model artifacts (binary, large)
ml/artifacts/*.joblib
ml/artifacts/*.keras
ml/artifacts/resnet50_*/

# SRTM elevation tile (25 MB)
ml/data/gis/srtm/

# Prepared image dataset (generated from originals)
ml/data/images_prepared/

# Raw training images (user-provided, not redistributable)
ml/data/images/

# Generated CSVs (reproducible from scripts)
ml/data/train_pre.csv
ml/data/train_post.csv
ml/data/generation_meta.json
```

### What to commit

```
ml/scripts/generate_synthetic_data.py   ✅ commit
ml/scripts/prepare_image_dataset.py     ✅ commit
ml/train_tabular_rf.py                  ✅ commit
ml/train_resnet50.py                    ✅ commit
ml/requirements.txt                     ✅ commit
ml/data_dictionary.md                   ✅ commit
ml/labeling_rubric.md                   ✅ commit
ml/resnet50_dataset_plan.md             ✅ commit
ml/NEXT_STEPS.md                        ✅ commit
ml/artifacts/rf_pre_metadata.json       ✅ commit  (metadata only, not .joblib)
ml/artifacts/rf_post_metadata.json      ✅ commit
ml/artifacts/resnet50_pre_metadata.json ✅ commit
ml/artifacts/resnet50_post_metadata.json✅ commit
ml/data/gis/data/**  (PHIVOLCS .shp)    ✅ commit (small)
ml/data/gis/data/Soil_Map_SJDM.png      ✅ commit
ml/data/gis/data/Contour_Map_SJDM.png   ✅ commit
```

### On another device after git pull

```bash
cd ml
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Regenerate data + retrain (downloads SRTM automatically, needs Nominatim network)
python scripts/generate_synthetic_data.py --n 5000
python train_tabular_rf.py

# For ResNet50: place raw images in data/images/train/{low,moderate,high}/
# then:
python scripts/prepare_image_dataset.py
python train_resnet50.py
```

---

## Step 7 — Validate with Real Field Photos

Before thesis defense, collect at least a small real validation set:

1. **Take 20–30 photos** of real buildings in SJDM: some visibly undamaged (low),
   some with minor cracks (moderate), and any damaged structures (high).
2. Have your adviser or a structural engineer label them.
3. Run `model.predict()` on each and compute the F1.
4. Report this as "field validation F1" alongside the training-set F1 in your paper.

Even if field F1 drops to 70–80%, that result is more credible and thesis-worthy
than only reporting the training-set 99.8%. It also demonstrates you understand the
domain shift problem.

---

## Summary Checklist

```
[ ] Step 1 — Implement ml_fusion_engine.py (ResNet50 + RF + Late Fusion)
[ ] Step 2 — Add /ai/predict/* endpoints to main.py
[ ] Step 3 — Add elevation_m / slope_deg to AssessmentCreate schema + mobile form
[ ] Step 4 — Mobile app: 4-step capture flow + blur/tilt checks
[ ] Step 5 — Gemini API action planning (post-MVP P1)
[ ] Step 6 — Update .gitignore and push ml/ to GitHub
[ ] Step 7 — Collect 20–30 real field photos, run validation
```
