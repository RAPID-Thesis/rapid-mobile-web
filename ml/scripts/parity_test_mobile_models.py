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
import re
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
    """A probe image whose three channels are strongly unequal.

    This used to be a flat (110, 120, 130) rectangle. Both properties were a
    problem: flat meant the centre-crop and resize were never really exercised,
    and near-equal channels meant an RGB/BGR mix-up shifted the tensor by only
    ~20/255 and stayed invisible. The gradients below put the three channels on
    different axes, so a channel permutation is unmissable.
    """
    import numpy as np
    from PIL import Image

    h, w = 720, 960
    ys, xs = np.mgrid[0:h, 0:w]
    arr = np.stack(
        [
            (255 * xs / (w - 1)).astype(np.uint8),                 # R ramps left -> right
            (255 * ys / (h - 1)).astype(np.uint8),                 # G ramps top -> bottom
            (255 * ((xs // 60 + ys // 60) % 2)).astype(np.uint8),  # B checkerboard
        ],
        axis=-1,
    )
    buf = BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="JPEG", quality=85)
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


# --- TypeScript preprocessing parity -----------------------------------------
#
# Everything else in this file compares Python against the exported artifacts,
# which leaves the largest surface untested: the device does not run Python, it
# runs mobile/services/ml/resnetPreprocess.ts. A mistake there is silent -- the
# model still returns a confident answer, just computed on the wrong tensor. That
# is exactly what happened (the RGB->BGR flip was missing) and nothing here could
# see it, because _run_tflite calls keras' own preprocess_input.
#
# Rather than keep a Python copy of the TS in sync -- which would only move the
# drift somewhere else -- this parses the channel permutation and the means back
# out of the real .ts file and checks those against keras.
TS_PREPROCESS = REPO_ROOT / "mobile" / "services" / "ml" / "resnetPreprocess.ts"

_TS_ASSIGN = re.compile(
    r"out\[i \* 3(?:\s*\+\s*(\d+))?\]\s*="
    r"\s*rgb\[i \* 3(?:\s*\+\s*(\d+))?\]!"
    r"\s*-\s*RESNET_MEANS\[(\d+)\]!"
)
_TS_MEANS = re.compile(r"const RESNET_MEANS\s*=\s*\[([^\]]+)\]")


def _parse_ts_preprocess() -> tuple[list[int], list[float]]:
    """Read the channel mapping the device actually applies out of the TS source.

    Returns (source RGB channel per output channel, mean per output channel).
    """
    text = TS_PREPROCESS.read_text(encoding="utf-8")

    means_match = _TS_MEANS.search(text)
    if not means_match:
        raise RuntimeError(f"could not find RESNET_MEANS in {TS_PREPROCESS}")
    means = [float(v) for v in means_match.group(1).split(",")]

    src_of_out: dict[int, int] = {}
    mean_of_out: dict[int, int] = {}
    for out_off, rgb_off, mean_idx in _TS_ASSIGN.findall(text):
        out_channel = int(out_off or 0)
        src_of_out[out_channel] = int(rgb_off or 0)
        mean_of_out[out_channel] = int(mean_idx)

    if sorted(src_of_out) != [0, 1, 2]:
        raise RuntimeError(
            f"expected 3 channel assignments in {TS_PREPROCESS.name}, "
            f"found {sorted(src_of_out)}"
        )
    return (
        [src_of_out[0], src_of_out[1], src_of_out[2]],
        [means[mean_of_out[0]], means[mean_of_out[1]], means[mean_of_out[2]]],
    )


def _check_ts_preprocess_parity(jpeg: bytes, tol: float) -> bool:
    import numpy as np
    from keras.applications.resnet50 import preprocess_input

    from app.services.ml_fusion_engine import _preprocess_image  # noqa: E402

    rgb = _preprocess_image(jpeg).astype(np.float32)
    expected = preprocess_input(rgb.copy())

    perm, means = _parse_ts_preprocess()
    actual = np.stack([rgb[..., perm[c]] - means[c] for c in range(3)], axis=-1)

    delta = float(np.abs(expected - actual).max())
    print("\n=== PREPROCESS (resnetPreprocess.ts vs keras) ===")
    print(f"  device writes  out[c] = rgb[{perm}][c] - {means}")
    print(f"  max abs delta  {delta:.4f}")
    if delta > tol:
        print(
            "  FAIL: the device feeds the network a different tensor than training used.\n"
            "        preprocess_input(mode='caffe') flips RGB->BGR and *then* subtracts\n"
            "        [103.939, 116.779, 123.68], so out[c] must read rgb[[2, 1, 0]][c].\n"
            "        The .tflite has no preprocess layer of its own -- export_mobile_models.py\n"
            "        rebuilds the graph from a bare keras.Input -- so resnetPreprocess.ts is\n"
            "        the only place both steps can happen."
        )
        return False
    print("  OK")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tolerance", type=float, default=0.05)
    args = parser.parse_args()

    # The preprocess check compares 0-255 pixel values rather than probabilities,
    # so it gets its own tolerance: exact, but for JPEG round-tripping.
    tolerance_px = 1e-3

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

    # Cheap and artifact-independent, so it runs first: if the device preprocesses
    # differently than training did, every comparison below measures the wrong thing.
    ts_ok = _check_ts_preprocess_parity(jpeg, tolerance_px)

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

    ok = ts_ok
    for phase_key, phase_api in [("pre", "pre-earthquake"), ("post", "post-earthquake")]:
        classes = manifest[phase_key]["classes"]
        # The ResNet's raw output axis is not the canonical class order for post-EQ. Older
        # manifests lack the field, in which case the two coincide only for "pre".
        resnet_classes = manifest[phase_key].get("resnet_output_classes", classes)
        rf_classes = manifest[phase_key].get("rf_output_classes", classes)
        print(f"\n=== {phase_key.upper()} ===")
        if list(resnet_classes) != list(classes):
            print(f"  (ResNet output order {resnet_classes} differs from canonical {classes})")

        py_img = predict_image([jpeg], phase_api)
        tflite_img = _run_tflite(
            MOBILE / manifest[phase_key]["resnet"]["file"], jpeg, list(resnet_classes)
        )
        print(f"ResNet  py={py_img['label']} mobile={tflite_img['label']}")
        if py_img["label"] != tflite_img["label"]:
            print("  WARN: label mismatch (TFLite quantization may shift borderline cases)")

        py_tab = predict_tabular(tabular, phase_api)
        onnx_tab = _run_onnx(
            MOBILE / manifest[phase_key]["rf"]["file"], row, list(rf_classes), phase_key
        )
        print(f"RF      py={py_tab['label']} mobile={onnx_tab['label']}")
        if not _prob_close(py_tab["probabilities"], onnx_tab["probabilities"], args.tolerance):
            print("  WARN: RF probability drift > tolerance")
            ok = False

        py_fused = predict_fused(images=[jpeg], tabular=tabular, phase=phase_api)
        # Manual fusion from mobile branches
        iw = manifest["fusion"]["image_weight"]
        tw = manifest["fusion"]["tabular_weight"]
        import numpy as np

        # Both branches are keyed by class NAME here, so the differing raw axes line up.
        iv = np.array([tflite_img["probabilities"][c] for c in classes])
        tv = np.array([onnx_tab["probabilities"][c] for c in classes])
        fused = iw * iv + tw * tv
        idx = int(np.argmax(fused))
        mob_label = classes[idx]
        print(f"Fusion  py={py_fused['label']} mobile={mob_label}")
        if py_fused["label"] != mob_label:
            print("  WARN: fused label mismatch")
            ok = False

    print("\n" + ("OK" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
