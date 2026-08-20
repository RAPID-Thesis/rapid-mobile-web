"""
Transfer-learn ResNet50 for earthquake damage classification (pre-EQ and post-EQ).

Anti-overfitting design:
  - Strong in-model augmentation (flip/rotate/zoom/brightness/contrast + random translate).
  - High dropout (0.5 at head) + L2 weight decay on dense layers.
  - Label smoothing = 0.1 in the loss.
  - Early stopping on val_loss with min_delta.
  - ReduceLROnPlateau tightens the fine-tune phase.
  - Two-phase training: frozen base -> unfreeze only top ~20 layers (small fine-tune window).

Usage (from ml/):
  python scripts/prepare_image_dataset.py   # leakage-safe balance + split (run once)
  python train_resnet50.py                  # train both pre and post models
  python train_resnet50.py --mode pre       # train only pre-EQ model
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix, f1_score

ML_ROOT = Path(__file__).resolve().parent
ARTIFACTS_DIR = ML_ROOT / "artifacts"

IMG_SIZE = (224, 224)
BATCH_SIZE = 32

PRE_LABELS = ["high", "low", "moderate"]
POST_LABELS = ["RESTRICTED", "SAFE", "UNSAFE"]

L2_REG = 1e-4
LABEL_SMOOTHING = 0.10
HEAD_DROPOUT_1 = 0.5
HEAD_DROPOUT_2 = 0.4

# Above this, a validation score on this dataset means the model found the source-pool
# shortcut rather than learning severity. Training aborts instead of saving.
SUSPICIOUS_F1 = 0.98


def _degrade(image, label, min_scale: float = 0.25, jpeg_min: int = 25):
    """Randomize effective resolution and JPEG quality on a single training image.

    This is the countermeasure for the dataset's structural confound: `low` comes almost
    entirely from 227px lab crops (pool A) while `moderate`/`high` come from 640px photos
    (pool C), so native sharpness alone separates the classes. Randomly downscaling and
    re-encoding destroys that cue, forcing the network onto the damage itself.

    Without it the model relearns exactly the shortcut that produced 0.9975 validation F1
    and 0.074 accuracy on real field photos.
    """
    scale = tf.random.uniform([], min_scale, 1.0)
    side = tf.maximum(tf.cast(tf.round(IMG_SIZE[0] * scale), tf.int32), 32)
    small = tf.image.resize(image, (side, side), method="area")
    back = tf.image.resize(small, IMG_SIZE, method="bilinear")

    encoded = tf.cast(tf.clip_by_value(back, 0.0, 255.0), tf.uint8)
    encoded = tf.image.random_jpeg_quality(encoded, jpeg_min, 95)
    return tf.cast(encoded, tf.float32), label


def load_datasets(
    data_dir: Path,
    batch_size: int = BATCH_SIZE,
    degrade: bool = True,
    probe: bool = False,
):
    train_ds = tf.keras.utils.image_dataset_from_directory(
        data_dir / "train",
        image_size=IMG_SIZE,
        batch_size=batch_size,
        label_mode="categorical",
        shuffle=True,
        seed=42,
    )
    val_ds = tf.keras.utils.image_dataset_from_directory(
        data_dir / "val",
        image_size=IMG_SIZE,
        batch_size=batch_size,
        label_mode="categorical",
        shuffle=False,
    )
    class_names = train_ds.class_names
    print(f"Classes (alphabetical): {class_names}")
    print(f"Train batches: {tf.data.experimental.cardinality(train_ds).numpy()}")
    print(f"Val batches: {tf.data.experimental.cardinality(val_ds).numpy()}")

    if probe:
        # Shortcut probe: crush every image to 16x16 before restoring it to 224. Semantic
        # content is gone; only global statistics (resolution signature, colour cast, overall
        # contrast) survive. Accuracy well above chance here means the model can still tell the
        # classes apart WITHOUT seeing the damage -- i.e. the shortcut is intact.
        print("\n  [shortcut probe] training on 16x16-crushed images; "
              "high accuracy here means the shortcut survives.")
        crush = lambda x, y: _degrade(x, y, min_scale=16 / IMG_SIZE[0], jpeg_min=15)  # noqa: E731
        train_ds = train_ds.unbatch().map(crush, num_parallel_calls=tf.data.AUTOTUNE).batch(batch_size)
        val_ds = val_ds.unbatch().map(crush, num_parallel_calls=tf.data.AUTOTUNE).batch(batch_size)
    elif degrade:
        train_ds = (
            train_ds.unbatch()
            .map(_degrade, num_parallel_calls=tf.data.AUTOTUNE)
            .batch(batch_size)
        )

    train_ds = train_ds.prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.prefetch(tf.data.AUTOTUNE)
    return train_ds, val_ds, class_names


def build_model(num_classes: int) -> tuple[tf.keras.Model, tf.keras.Model]:
    """ResNet50 with frozen base + regularized classification head."""
    data_augmentation = tf.keras.Sequential([
        tf.keras.layers.RandomFlip("horizontal"),
        tf.keras.layers.RandomRotation(0.12),
        tf.keras.layers.RandomZoom(0.15),
        tf.keras.layers.RandomTranslation(0.1, 0.1),
        tf.keras.layers.RandomBrightness(0.15),
        tf.keras.layers.RandomContrast(0.15),
    ], name="augmentation")

    base = tf.keras.applications.ResNet50(
        weights="imagenet",
        include_top=False,
        input_shape=(*IMG_SIZE, 3),
    )
    base.trainable = False

    inputs = tf.keras.Input(shape=(*IMG_SIZE, 3))
    x = data_augmentation(inputs)
    x = tf.keras.applications.resnet50.preprocess_input(x)
    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(HEAD_DROPOUT_1)(x)
    x = tf.keras.layers.Dense(
        256, activation="relu",
        kernel_regularizer=tf.keras.regularizers.l2(L2_REG),
    )(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(HEAD_DROPOUT_2)(x)
    outputs = tf.keras.layers.Dense(
        num_classes, activation="softmax",
        kernel_regularizer=tf.keras.regularizers.l2(L2_REG),
    )(x)

    return tf.keras.Model(inputs, outputs), base


def compute_class_weights(train_ds, class_names: list[str]) -> dict[int, float]:
    counts = np.zeros(len(class_names))
    for _, labels in train_ds:
        counts += labels.numpy().sum(axis=0)
    total = counts.sum()
    n_classes = len(class_names)
    weights = {i: total / (n_classes * c) if c > 0 else 1.0 for i, c in enumerate(counts)}
    print(f"Class counts: {dict(zip(class_names, counts.astype(int)))}")
    print(f"Class weights: { {class_names[i]: f'{w:.2f}' for i, w in weights.items()} }")
    return weights


def evaluate_model(model, val_ds, class_names: list[str]) -> dict:
    y_true_all = []
    y_pred_all = []
    for images, labels in val_ds:
        preds = model.predict(images, verbose=0)
        y_true_all.extend(np.argmax(labels.numpy(), axis=1))
        y_pred_all.extend(np.argmax(preds, axis=1))

    y_true = np.array(y_true_all)
    y_pred = np.array(y_pred_all)

    macro_f1 = f1_score(y_true, y_pred, average="macro")
    print(f"\nValidation Macro F1: {macro_f1:.4f}")
    print("\nClassification Report:")
    print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))
    print("Confusion Matrix:")
    cm = confusion_matrix(y_true, y_pred)
    print(cm)

    return {
        "macro_f1": float(macro_f1),
        "per_class_f1": {
            name: float(f)
            for name, f in zip(class_names, f1_score(y_true, y_pred, average=None))
        },
        "confusion_matrix": cm.tolist(),
    }


def train_one(
    mode: str,
    data_dir: Path,
    *,
    degrade: bool = True,
    probe: bool = False,
    allow_suspicious: bool = False,
) -> None:
    print(f"\n{'='*60}")
    print(f"  Training ResNet50 -- {mode}-EQ model")
    print(f"{'='*60}\n")

    train_ds, val_ds, class_names = load_datasets(data_dir, degrade=degrade, probe=probe)
    num_classes = len(class_names)
    class_weights = compute_class_weights(train_ds, class_names)

    model, base_model = build_model(num_classes)

    loss = tf.keras.losses.CategoricalCrossentropy(label_smoothing=LABEL_SMOOTHING)

    # --- Phase 1: Train head only ---
    print("\n--- Phase 1: Training classification head (base frozen) ---")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss=loss,
        metrics=["accuracy"],
    )
    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=6,
        class_weight=class_weights,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(
                monitor="val_loss", patience=2, min_delta=1e-3,
                restore_best_weights=True,
            ),
        ],
    )

    # --- Phase 2: Fine-tune top layers ---
    print("\n--- Phase 2: Fine-tuning top 20 ResNet50 layers ---")
    base_model.trainable = True
    for layer in base_model.layers[:-20]:
        layer.trainable = False
    # Keep BatchNorm frozen (best practice for small fine-tuning datasets)
    for layer in base_model.layers:
        if isinstance(layer, tf.keras.layers.BatchNormalization):
            layer.trainable = False

    trainable_params = sum(
        tf.keras.backend.count_params(w) for w in model.trainable_weights
    )
    print(f"Trainable params: {trainable_params:,} / {model.count_params():,}")

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
        loss=loss,
        metrics=["accuracy"],
    )
    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=8,
        class_weight=class_weights,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(
                monitor="val_loss", patience=3, min_delta=1e-3,
                restore_best_weights=True,
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                monitor="val_loss", factor=0.5, patience=2, min_lr=1e-7, verbose=1,
            ),
        ],
    )

    # --- Evaluate ---
    metrics = evaluate_model(model, val_ds, class_names)

    # The previous model shipped with val macro F1 = 0.9975 and scored 0.074 on real photos.
    # That warning was printed and ignored, so it is now a hard stop.
    if metrics["macro_f1"] > SUSPICIOUS_F1 and not allow_suspicious:
        print(f"\n  ABORT: val macro F1 = {metrics['macro_f1']:.4f} exceeds {SUSPICIOUS_F1}.",
              file=sys.stderr)
        print("  On this dataset that indicates the model is separating source pools rather", file=sys.stderr)
        print("  than damage severity -- the exact failure that produced the previous model.", file=sys.stderr)
        print("  Investigate before shipping, or pass --allow-suspicious if you have verified", file=sys.stderr)
        print("  it with --shortcut-probe and evaluate_on_real.py.", file=sys.stderr)
        sys.exit(2)

    if probe:
        chance = 1.0 / len(class_names)
        print(f"\n  [shortcut probe] macro F1 on semantically destroyed images: "
              f"{metrics['macro_f1']:.3f}  (chance ~= {chance:.2f})")
        if metrics["macro_f1"] > chance + 0.20:
            print("  The classes are still separable without visible damage -- the shortcut "
                  "SURVIVES. Rebalance the class x pool matrix before trusting any score.",
                  file=sys.stderr)
        else:
            print("  Near chance, as intended: the classes are not separable from global "
                  "image statistics alone.")
        print("  (probe run -- no model saved)")
        return

    # --- Save ---
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    model_dir = ARTIFACTS_DIR / f"resnet50_{mode}.keras"
    model.save(model_dir)
    print(f"\nSaved model -> {model_dir}")

    meta = {
        "model_key": f"resnet50_{mode}",
        "mode": mode,
        "tf_version": tf.__version__,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "class_names": class_names,
        "image_size": list(IMG_SIZE),
        "data_dir": str(data_dir),
        "val_macro_f1": metrics["macro_f1"],
        "per_class_f1": metrics["per_class_f1"],
        "confusion_matrix": metrics["confusion_matrix"],
        "regularization": {
            "l2": L2_REG,
            "label_smoothing": LABEL_SMOOTHING,
            "head_dropout": [HEAD_DROPOUT_1, HEAD_DROPOUT_2],
            "fine_tune_layers": 20,
            "batchnorm_frozen": True,
        },
    }
    meta_path = ARTIFACTS_DIR / f"resnet50_{mode}_metadata.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved metadata -> {meta_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train ResNet50 image classifier.")
    parser.add_argument("--mode", choices=["pre", "post", "both"], default="both")
    parser.add_argument("--data-dir", type=Path,
                        default=ML_ROOT / "data" / "images_prepared")
    parser.add_argument("--no-degrade", action="store_true",
                        help="Disable scale/quality randomization. Only for ablation -- without "
                             "it the source-pool shortcut is fully available.")
    parser.add_argument("--shortcut-probe", action="store_true",
                        help="Diagnostic: train on 16x16-crushed images. Accuracy near chance "
                             "(~0.33) means the classes are NOT separable without seeing the "
                             "damage. Does not save a model.")
    parser.add_argument("--allow-suspicious", action="store_true",
                        help=f"Save even if val macro F1 exceeds {SUSPICIOUS_F1}.")
    args = parser.parse_args()

    if not (args.data_dir / "train").is_dir():
        print(f"No prepared dataset at {args.data_dir}. "
              f"Run: python scripts/prepare_image_dataset.py", file=sys.stderr)
        sys.exit(1)

    modes = ["pre", "post"] if args.mode == "both" else [args.mode]
    for mode in modes:
        train_one(
            mode, args.data_dir,
            degrade=not args.no_degrade,
            probe=args.shortcut_probe,
            allow_suspicious=args.allow_suspicious or args.shortcut_probe,
        )


if __name__ == "__main__":
    main()
