---
name: ml-experiment
description: Rules for writing or changing model, feature, inference, or evaluation code. Use when touching data pipelines, features, training, the fusion engine, on-device inference, or metrics.
paths:
  - "ml/**"
  - "backend/app/services/ml_fusion_engine.py"
  - "mobile/services/ml/**"
  - "mobile/services/onDeviceMl.ts"
  - "mobile/services/localPredict.ts"
---

When writing or changing ML code, hold to these.

Frozen models
- The ResNet50 and Random Forest artifacts are trained and frozen. Do **not** add training, fine-tuning, augmentation, or weight-adjustment code to `backend/` or `mobile/` — those surfaces are inference only.
- Retraining belongs in `ml/train_tabular_rf.py` / `ml/train_resnet50.py`. If a task seems to need retraining, say so and stop; don't retrain implicitly.

Parity between the two inference paths — the highest-risk failure mode here
- The same pipeline exists twice: [ml_fusion_engine.py](backend/app/services/ml_fusion_engine.py) (server) and [mobile/services/ml/](mobile/services/ml/) (device). Changing one without the other produces two systems that disagree, silently, with no error.
- These must match exactly on both sides: class order (`PRE_CLASSES = high, low, moderate` — alphabetical, *not* severity order; `POST_CLASSES = RESTRICTED, SAFE, UNSAFE`), fusion weights (image 0.45 / tabular 0.55), 224px preprocessing and normalization, and every categorical encoding/mapping.
- Class order feeds `argmax` → label. Reordering a class list is a silent mislabeling bug, not a cosmetic change. Treat the tuple order as a wire contract.
- After any change to either side: re-run `python ml/scripts/export_mobile_models.py`, then `python ml/scripts/parity_test_mobile_models.py`, and report the parity output. A change is not done until parity passes.
- Three-way skew is possible: training → server inference → device inference. Check all three, not just train/serve.

Data integrity (training work in `ml/` only)
- No leakage: fit scalers/encoders/imputers on train only, then transform val/test. Split before any fit.
- No target leakage: never use a feature derived from the label or from the future.
- Split by the right key (building/entity, or time for temporal data) when rows aren't independent.

Reproducibility
- Seed everything (numpy, framework, dataloader) and log the seed.
- Pin data version and model/checkpoint version. Config over hardcoded values — model locations come from `MODEL_DIR`/`SRTM_DIR`, never a literal path.
- Deterministic inference unless randomness is required and documented.

Evaluation
- Report the metric that matches the decision (precision/recall/F1 per class, calibration for the confidence scores the UI displays), not just accuracy.
- Always compare against a baseline (majority class / simple heuristic). No baseline, no claim.
- Fusion has to beat both single-modality branches — that's a thesis claim, so show the comparison, not just the fused number.
- Keep the test set untouched until final evaluation. Note that `ml/data/train_*.csv` is synthetic and regenerable; don't present synthetic-set metrics as field performance.

Serving
- Feature computation at inference must match training exactly. Flag any skew.
- Validate and bound inputs at the API edge. Degrade explicitly, never silently: fusion already handles a missing modality (image-only / tabular-only) with renormalized weights — preserve that, and keep `prediction_source` honest so the UI can distinguish real fusion from the offline heuristic.
- Keep TensorFlow imports function-local so API startup and cold starts don't pay for them.

State assumptions explicitly. Flag anything you can't verify from the code.
