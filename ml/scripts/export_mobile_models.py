#!/usr/bin/env python3
"""
Export server ML artifacts for on-device Android inference.

  python ml/scripts/export_mobile_models.py
  python ml/scripts/export_mobile_models.py --copy-to-mobile

Outputs under ml/artifacts/mobile/:
  resnet50_pre.tflite, resnet50_post.tflite
  rf_pre.onnx, rf_post.onnx
  mobile_manifest.json  (class orders, fusion weights, ONNX I/O names)
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = REPO_ROOT / "ml" / "artifacts"
MOBILE_OUT = ARTIFACTS / "mobile"
MOBILE_ASSETS = REPO_ROOT / "mobile" / "assets" / "models"

PRE_CLASSES = ["high", "low", "moderate"]
POST_CLASSES = ["RESTRICTED", "SAFE", "UNSAFE"]
IMAGE_WEIGHT = 0.45
TABULAR_WEIGHT = 0.55

SAMPLE_TABULAR_ROW = {
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


def _require_files() -> None:
    required = [
        "rf_pre.joblib",
        "rf_post.joblib",
        "resnet50_pre.keras",
        "resnet50_post.keras",
    ]
    missing = [n for n in required if not (ARTIFACTS / n).is_file()]
    if missing:
        print("ERROR: missing artifacts:", ", ".join(missing), file=sys.stderr)
        print(f"Train models first; expected under {ARTIFACTS}", file=sys.stderr)
        raise SystemExit(1)


def _build_inference_model(trained: "tf.keras.Model") -> "tf.keras.Model":
    """Rebuild a TFLite-friendly inference graph (no augmentation/dropout)."""
    import keras
    import tensorflow as tf

    num_classes = int(trained.get_layer("dense_1").units)

    inp = keras.Input(shape=(224, 224, 3), dtype=tf.float32, name="image_input")
    base = keras.applications.ResNet50(
        weights=None, include_top=False, input_shape=(224, 224, 3)
    )
    base.set_weights(trained.get_layer("resnet50").get_weights())
    x = base(inp, training=False)
    x = keras.layers.GlobalAveragePooling2D()(x)

    bn1 = keras.layers.BatchNormalization()
    x = bn1(x, training=False)
    bn1.set_weights(trained.get_layer("batch_normalization").get_weights())

    d1 = keras.layers.Dense(256, activation="relu")
    x = d1(x)
    d1.set_weights(trained.get_layer("dense").get_weights())

    bn2 = keras.layers.BatchNormalization()
    x = bn2(x, training=False)
    bn2.set_weights(trained.get_layer("batch_normalization_1").get_weights())

    d2 = keras.layers.Dense(num_classes, activation="softmax")
    x = d2(x)
    d2.set_weights(trained.get_layer("dense_1").get_weights())

    return keras.Model(inp, x, name=f"{trained.name}_infer")


def _export_resnet_tflite(phase: str, out_dir: Path) -> dict:
    import numpy as np
    import tensorflow as tf

    src = ARTIFACTS / f"resnet50_{phase}.keras"
    print(f"  Loading {src.name}...")
    trained = tf.keras.models.load_model(src, compile=False)
    infer = _build_inference_model(trained)

    # Keras 3 + TF 2.20: from_keras_model fails; concrete_function path works.
    @tf.function(input_signature=[tf.TensorSpec([None, 224, 224, 3], tf.float32)])
    def infer_fn(x):
        return infer(x, training=False)

    converter = tf.lite.TFLiteConverter.from_concrete_functions(
        [infer_fn.get_concrete_function()]
    )
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_types = [tf.float16]
    tflite_bytes = converter.convert()

    out_path = out_dir / f"resnet50_{phase}.tflite"
    out_path.write_bytes(tflite_bytes)
    size_mb = len(tflite_bytes) / (1024 * 1024)
    print(f"  Wrote {out_path.name} ({size_mb:.1f} MB)")

    # Smoke-run interpreter
    interpreter = tf.lite.Interpreter(model_content=tflite_bytes)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    dummy = np.zeros((1, 224, 224, 3), dtype=np.float32)
    interpreter.set_tensor(input_details[0]["index"], dummy)
    interpreter.invoke()
    probs = interpreter.get_tensor(output_details[0]["index"])[0]

    classes = PRE_CLASSES if phase == "pre" else POST_CLASSES
    idx = int(np.argmax(probs))
    return {
        "file": out_path.name,
        "input_name": input_details[0].get("name", "image_input"),
        "input_shape": [224, 224, 3],
        "input_dtype": "float32",
        "preprocess": "resnet50_caffe_mean_subtract",
        "preprocess_means": [103.939, 116.779, 123.68],
        "output_name": output_details[0].get("name", "output"),
        "classes": list(classes),
        "smoke_label": classes[idx],
        "size_bytes": len(tflite_bytes),
    }


def _extract_preprocessor_spec(pipeline) -> dict:
    import numpy as np

    prep = pipeline.named_steps["preprocess"]
    num_pipe = prep.named_transformers_["num"]
    cat_pipe = prep.named_transformers_["cat"]
    num_imp = num_pipe.named_steps["imputer"]
    ohe = cat_pipe.named_steps["onehot"]

    return {
        "numeric_features": list(num_pipe.feature_names_in_),
        "numeric_medians": [float(x) for x in num_imp.statistics_],
        "categorical_features": list(cat_pipe.feature_names_in_),
        "one_hot": [
            {
                "column": col,
                "categories": [str(c) for c in cats],
            }
            for col, cats in zip(cat_pipe.feature_names_in_, ohe.categories_, strict=True)
        ],
        "feature_names": [str(n) for n in prep.get_feature_names_out()],
        "input_dim": int(len(prep.get_feature_names_out())),
    }


def _export_rf_onnx(phase: str, out_dir: Path) -> dict:
    import joblib
    import numpy as np
    import onnxruntime as ort
    import pandas as pd
    from skl2onnx import to_onnx

    src = ARTIFACTS / f"rf_{phase}.joblib"
    print(f"  Loading {src.name}...")
    pipeline = joblib.load(src)
    preprocess = pipeline.named_steps["preprocess"]
    classifier = pipeline.named_steps["classifier"]

    sample = pd.DataFrame([SAMPLE_TABULAR_ROW])
    x_encoded = preprocess.transform(sample).astype(np.float32)

    # skl2onnx cannot convert float SimpleImputer; export classifier on encoded features.
    onnx_model = to_onnx(classifier, x_encoded, target_opset=15, options={"zipmap": False})
    out_path = out_dir / f"rf_{phase}.onnx"
    out_path.write_bytes(onnx_model.SerializeToString())
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"  Wrote {out_path.name} ({size_mb:.1f} MB, classifier-only)")

    sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    feeds = {inp.name: x_encoded}
    try:
        result = sess.run(None, feeds)
    except Exception as exc:
        print(f"  WARN: ONNX smoke run failed ({exc}); manifest still written.")
        result = None

    classes = PRE_CLASSES if phase == "pre" else POST_CLASSES
    smoke = None
    if result is not None:
        probs = result[1] if len(result) > 1 else result[0]
        if probs.ndim == 2:
            idx = int(np.argmax(probs[0]))
            smoke = {"label": classes[idx], "confidence": float(probs[0][idx])}

    inputs_meta = [{"name": i.name, "shape": i.shape, "type": i.type} for i in sess.get_inputs()]
    outputs_meta = [{"name": o.name, "shape": o.shape, "type": o.type} for o in sess.get_outputs()]
    preprocessor = _extract_preprocessor_spec(pipeline)

    return {
        "file": out_path.name,
        "classifier_only": True,
        "feature_columns": list(SAMPLE_TABULAR_ROW.keys()),
        "sample_row": SAMPLE_TABULAR_ROW,
        "preprocessor": preprocessor,
        "classes": list(classes),
        "inputs": inputs_meta,
        "outputs": outputs_meta,
        "smoke": smoke,
        "size_bytes": out_path.stat().st_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Export TFLite + ONNX mobile models.")
    parser.add_argument(
        "--copy-to-mobile",
        action="store_true",
        help="Copy ml/artifacts/mobile/* into mobile/assets/models/",
    )
    args = parser.parse_args()

    _require_files()
    MOBILE_OUT.mkdir(parents=True, exist_ok=True)

    print("Exporting ResNet50 -> TFLite (float16)...")
    resnet_pre = _export_resnet_tflite("pre", MOBILE_OUT)
    resnet_post = _export_resnet_tflite("post", MOBILE_OUT)

    print("Exporting Random Forest -> ONNX...")
    rf_pre = _export_rf_onnx("pre", MOBILE_OUT)
    rf_post = _export_rf_onnx("post", MOBILE_OUT)

    manifest = {
        "exported_at_utc": datetime.now(timezone.utc).isoformat(),
        "fusion": {
            "image_weight": IMAGE_WEIGHT,
            "tabular_weight": TABULAR_WEIGHT,
        },
        "pre": {
            "classes": PRE_CLASSES,
            "resnet": resnet_pre,
            "rf": rf_pre,
        },
        "post": {
            "classes": POST_CLASSES,
            "resnet": resnet_post,
            "rf": rf_post,
        },
        "image_preprocess": {
            "size": 224,
            "crop": "center_square",
            "input_dtype": "float32",
            "preprocess": "Subtract ImageNet means [103.939, 116.779, 123.68] after scaling RGB 0-255 (ResNet50 caffe).",
            "note": "Match tf.keras.applications.resnet50.preprocess_input on float32 RGB.",
        },
    }
    manifest_path = MOBILE_OUT / "mobile_manifest.json"
    manifest["bundled"] = True
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {manifest_path}")

    if args.copy_to_mobile:
        MOBILE_ASSETS.mkdir(parents=True, exist_ok=True)
        for f in MOBILE_OUT.iterdir():
            if f.is_file():
                shutil.copy2(f, MOBILE_ASSETS / f.name)
        # Ensure manifest marks models as bundled for the mobile runtime
        mobile_manifest = MOBILE_ASSETS / "mobile_manifest.json"
        if mobile_manifest.is_file():
            data = json.loads(mobile_manifest.read_text(encoding="utf-8"))
            data["bundled"] = True
            mobile_manifest.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"Copied artifacts -> {MOBILE_ASSETS}")

    print("\nDone. Run parity test: python ml/scripts/parity_test_mobile_models.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
