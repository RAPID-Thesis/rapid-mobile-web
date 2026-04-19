#!/usr/bin/env python3
"""
Load RF + ResNet artifacts from ml/artifacts and run inference (same code as the API).

Usage (from repo root, with backend ML deps installed):

  cd rapid-mobile-web-main
  set MODEL_DIR=ml\\artifacts
  python ml/scripts/smoke_test_models.py

Or use the backend virtualenv:

  .venv\\Scripts\\activate
  pip install -r backend/requirements.txt
  python ml/scripts/smoke_test_models.py

First run loads TensorFlow + ~350MB of weights; expect 1–3 minutes on a laptop.
"""

from __future__ import annotations

import json
import os
import sys
from io import BytesIO
from pathlib import Path

# Repo root = .../rapid-mobile-web-main
REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND = REPO_ROOT / "backend"
ARTIFACTS = REPO_ROOT / "ml" / "artifacts"

os.environ.setdefault("MODEL_DIR", str(ARTIFACTS))
sys.path.insert(0, str(BACKEND))


def _dummy_image_jpeg() -> bytes:
    from PIL import Image

    img = Image.new("RGB", (960, 720), color=(110, 120, 130))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def main() -> int:
    try:
        import numpy  # noqa: F401
    except ImportError:
        print(
            "ERROR: numpy not found. Use the backend venv and install ML deps:\n"
            "  pip install -r backend/requirements.txt",
            file=sys.stderr,
        )
        return 1

    if not ARTIFACTS.is_dir():
        print(f"ERROR: artifacts folder not found: {ARTIFACTS}", file=sys.stderr)
        return 1

    required = [
        "rf_pre.joblib",
        "rf_post.joblib",
        "resnet50_pre.keras",
        "resnet50_post.keras",
    ]
    missing = [name for name in required if not (ARTIFACTS / name).is_file()]
    if missing:
        print("ERROR: missing model files:", ", ".join(missing), file=sys.stderr)
        return 1

    print(f"MODEL_DIR={os.environ['MODEL_DIR']}")
    print("Importing fusion engine (lazy TF/sklearn load on first predict)...")

    from app.services.ml_fusion_engine import (  # noqa: E402
        TabularInput,
        predict_fused,
        predict_image,
        predict_tabular,
    )

    tabular = TabularInput(
        year_built=1995,
        number_of_stories=3,
        building_use="residential",
        soil_classification="D",
        distance_to_fault_km=8.5,
        elevation_m=120.0,
        slope_deg=3.0,
        previous_retrofit=False,
        structural_system="moment_frame",
        foundation_type="shallow",
        material="concrete",
    )

    print("\n--- Random Forest (pre-earthquake) ---")
    out_pre = predict_tabular(tabular, "pre-earthquake")
    print(json.dumps({k: out_pre[k] for k in ("label", "confidence", "probabilities")}, indent=2))

    print("\n--- Random Forest (post-earthquake) ---")
    out_post = predict_tabular(tabular, "post-earthquake")
    print(json.dumps({k: out_post[k] for k in ("label", "confidence", "probabilities")}, indent=2))

    jpeg = _dummy_image_jpeg()
    print("\n--- ResNet50 (pre-earthquake, 1 JPEG) ---")
    img_pre = predict_image([jpeg], "pre-earthquake")
    print(json.dumps({k: img_pre[k] for k in ("label", "confidence", "probabilities")}, indent=2))

    print("\n--- ResNet50 (post-earthquake, 1 JPEG) ---")
    img_post = predict_image([jpeg], "post-earthquake")
    print(json.dumps({k: img_post[k] for k in ("label", "confidence", "probabilities")}, indent=2))

    print("\n--- Late fusion (pre-earthquake, image + tabular) ---")
    fused = predict_fused(images=[jpeg], tabular=tabular, phase="pre-earthquake")
    print(
        json.dumps(
            {
                "label": fused["label"],
                "confidence": fused["confidence"],
                "probabilities": fused["probabilities"],
                "weights": fused.get("weights"),
            },
            indent=2,
        )
    )

    print("\nOK — all inference paths completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
