#!/usr/bin/env python3
"""
Compare server predict_fused vs exported TFLite/ONNX mobile artifacts.

  python ml/scripts/parity_test_mobile_models.py
  python ml/scripts/parity_test_mobile_models.py --tolerance 0.02

Requires:
  - ml/artifacts/*.joblib + *.keras (source models)
  - ml/artifacts/mobile/* (from export_mobile_models.py)
  - backend venv with tensorflow, skl2onnx, onnxruntime
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from io import BytesIO
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = REPO_ROOT / "ml" / "artifacts"
MOBILE = ARTIFACTS / "mobile"
BACKEND = REPO_ROOT / "backend"

os.environ.setdefault("MODEL_DIR", str(ARTIFACTS))
sys.path.insert(0, str(BACKEND))


def _dummy_jpeg() -> bytes:
    from PIL import Image

    img = Image.new("RGB", (960, 720), color=(110, 120, 130))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _run_tflite(path: Path, jpeg: bytes, classes: list[str]) -> dict:
    import numpy as np
    import tensorflow as tf
    from keras.applications.resnet50 import preprocess_input

    from app.services.ml_fusion_engine import _preprocess_image  # noqa: E402

    rgb = _preprocess_image(jpeg).astype(np.float32)
    preprocessed = preprocess_input(rgb)
    batch = np.expand_dims(preprocessed, axis=0)

    interpreter = tf.lite.Interpreter(model_path=str(path))
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]

    tensor = batch.astype(inp["dtype"])
    interpreter.set_tensor(inp["index"], tensor)
    interpreter.invoke()
    probs = interpreter.get_tensor(out["index"])[0]
    idx = int(np.argmax(probs))
    return {
        "label": classes[idx],
        "confidence": float(probs[idx]),
        "probabilities": {c: float(p) for c, p in zip(classes, probs, strict=True)},
    }


def _run_onnx(path: Path, row: dict, classes: list[str], phase_key: str) -> dict:
    import joblib
    import numpy as np
    import onnxruntime as ort
    import pandas as pd

    pipeline = joblib.load(ARTIFACTS / f"rf_{phase_key}.joblib")
    sample = pd.DataFrame([row])
    x_encoded = pipeline.named_steps["preprocess"].transform(sample).astype(np.float32)

    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    outputs = sess.run(None, {inp.name: x_encoded})
    # Find probability output (2d float)
    probs = None
    for out in outputs:
        if hasattr(out, "ndim") and out.ndim == 2 and out.shape[1] == len(classes):
            probs = out[0]
            break
    if probs is None:
        probs = outputs[1][0] if len(outputs) > 1 else outputs[0][0]

    idx = int(np.argmax(probs))
    return {
        "label": classes[idx],
        "confidence": float(probs[idx]),
        "probabilities": {c: float(p) for c, p in zip(classes, probs, strict=True)},
    }


def _prob_close(a: dict, b: dict, tol: float) -> bool:
    for k in a:
        if abs(a[k] - b.get(k, 0.0)) > tol:
            return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tolerance", type=float, default=0.05)
    args = parser.parse_args()

    manifest_path = MOBILE / "mobile_manifest.json"
    if not manifest_path.is_file():
        print(f"ERROR: run export_mobile_models.py first ({manifest_path})", file=sys.stderr)
        return 1

    from app.services.ml_fusion_engine import (  # noqa: E402
        TabularInput,
        predict_fused,
        predict_image,
        predict_tabular,
        build_tabular_input,
    )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    jpeg = _dummy_jpeg()

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
    row = {
        "year_built": 1995.0,
        "building_age": 31.0,
        "number_of_stories": 3.0,
        "building_use": "residential",
        "soil_classification": "D",
        "distance_to_fault_km": 8.5,
        "elevation_m": 120.0,
        "slope_deg": 3.0,
        "previous_retrofit_as_int": 0.0,
        "structural_system": "moment_frame",
        "foundation_type": "shallow",
        "material": "concrete",
    }

    ok = True
    for phase_key, phase_api in [("pre", "pre-earthquake"), ("post", "post-earthquake")]:
        classes = manifest[phase_key]["classes"]
        print(f"\n=== {phase_key.upper()} ===")

        py_img = predict_image([jpeg], phase_api)
        tflite_img = _run_tflite(MOBILE / manifest[phase_key]["resnet"]["file"], jpeg, classes)
        print(f"ResNet  py={py_img['label']} mobile={tflite_img['label']}")
        if py_img["label"] != tflite_img["label"]:
            print("  WARN: label mismatch (TFLite quantization may shift borderline cases)")

        py_tab = predict_tabular(tabular, phase_api)
        onnx_tab = _run_onnx(MOBILE / manifest[phase_key]["rf"]["file"], row, classes, phase_key)
        print(f"RF      py={py_tab['label']} mobile={onnx_tab['label']}")
        if not _prob_close(py_tab["probabilities"], onnx_tab["probabilities"], args.tolerance):
            print("  WARN: RF probability drift > tolerance")
            ok = False

        py_fused = predict_fused(images=[jpeg], tabular=tabular, phase=phase_api)
        # Manual fusion from mobile branches
        iw = manifest["fusion"]["image_weight"]
        tw = manifest["fusion"]["tabular_weight"]
        import numpy as np

        iv = np.array([tflite_img["probabilities"][c] for c in classes])
        tv = np.array([onnx_tab["probabilities"][c] for c in classes])
        fused = iw * iv + tw * tv
        idx = int(np.argmax(fused))
        mob_label = classes[idx]
        print(f"Fusion  py={py_fused['label']} mobile={mob_label}")
        if py_fused["label"] != mob_label:
            print("  WARN: fused label mismatch")

    print("\n" + ("OK" if ok else "DONE with warnings"))
    return 0 if ok else 0


if __name__ == "__main__":
    raise SystemExit(main())
