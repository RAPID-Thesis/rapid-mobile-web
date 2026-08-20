"""
K-fold cross-validation that finally lets the model train on real field photos.

Why this exists: the 188 field photos were held out as a test set, so every model so far was
trained purely on Roboflow/Mendeley crops and had never seen a Philippine phone photo of a
wall. It scored 0.074 accuracy on real data, then 0.266 after relabeling -- both below the
0.856 majority baseline. The corpus simply does not transfer.

Cross-validation resolves the deadlock. The real photos are split into K stratified folds;
each fold is held out in turn while the model trains on the corpus plus the other K-1 folds.
Every photo is predicted exactly once by a model that never saw it, so the aggregate is an
honest out-of-sample measurement -- and all 188 still contribute to training.

Reported as one confusion matrix over all 188 predictions rather than a mean of per-fold
scores: with 9 `high` photos in total, a single fold holds one or two, and per-fold rates for
that class would be noise.

Usage (from repo root, with the backend venv):
  backend/.venv/Scripts/python.exe ml/scripts/kfold_real.py
  backend/.venv/Scripts/python.exe ml/scripts/kfold_real.py --folds 5 --epochs-head 5 --epochs-ft 5
  backend/.venv/Scripts/python.exe ml/scripts/kfold_real.py --final-model   # also fit on ALL data

Reads:  ml/data/images_prepared/   (corpus, from prepare_image_dataset.py)
        ml/data/images_eval/       (real field photos, from build_eval_set.py)
Writes: ml/artifacts/kfold_<timestamp>.json
        ml/artifacts/resnet50_{pre,post}.keras   (only with --final-model)
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_ROOT))

CLASSES = ["high", "low", "moderate"]  # alphabetical, matching image_dataset_from_directory
PRE_TO_POST = {"low": "SAFE", "moderate": "RESTRICTED", "high": "UNSAFE"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    if total == 0:
        return (0.0, 0.0)
    p = successes / total
    denom = 1 + z**2 / total
    center = (p + z**2 / (2 * total)) / denom
    margin = z * math.sqrt(p * (1 - p) / total + z**2 / (4 * total**2)) / denom
    return (max(0.0, center - margin), min(1.0, center + margin))


def list_split(root: Path) -> list[tuple[Path, int]]:
    out: list[tuple[Path, int]] = []
    for idx, cls in enumerate(CLASSES):
        d = root / cls
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES:
                out.append((f, idx))
    return out


def stratified_folds(items: list[tuple[Path, int]], k: int, seed: int) -> list[list[int]]:
    """Round-robin within each class so every fold gets a comparable class mix."""
    import random

    rng = random.Random(seed)
    folds: list[list[int]] = [[] for _ in range(k)]
    by_class: dict[int, list[int]] = {i: [] for i in range(len(CLASSES))}
    for i, (_p, y) in enumerate(items):
        by_class[y].append(i)
    for y, idxs in by_class.items():
        rng.shuffle(idxs)
        for j, i in enumerate(idxs):
            folds[j % k].append(i)
    return folds


def make_dataset(items: list[tuple[Path, int]], batch: int, training: bool, img_size: int):
    import tensorflow as tf

    from train_resnet50 import _degrade  # noqa: E402  (reuse the training-time degradation)

    paths = [str(p) for p, _ in items]
    labels = [y for _, y in items]

    def load(path, label):
        raw = tf.io.read_file(path)
        img = tf.io.decode_image(raw, channels=3, expand_animations=False)
        img = tf.image.resize(img, (img_size, img_size), method="bilinear")
        img.set_shape([img_size, img_size, 3])
        return img, tf.one_hot(label, len(CLASSES))

    ds = tf.data.Dataset.from_tensor_slices((paths, labels))
    ds = ds.map(load, num_parallel_calls=tf.data.AUTOTUNE).cache()
    if training:
        ds = ds.shuffle(min(len(items), 2048), seed=42, reshuffle_each_iteration=True)
        ds = ds.map(_degrade, num_parallel_calls=tf.data.AUTOTUNE)
    return ds.batch(batch).prefetch(tf.data.AUTOTUNE)


def fit_model(train_items, val_items, args, quiet: bool = True):
    import numpy as np
    import tensorflow as tf

    from train_resnet50 import (  # noqa: E402
        HEAD_DROPOUT_1, LABEL_SMOOTHING, build_model,
    )

    train_ds = make_dataset(train_items, args.batch, True, args.img_size)
    val_ds = make_dataset(val_items, args.batch, False, args.img_size) if val_items else None

    counts = Counter(y for _p, y in train_items)
    total = sum(counts.values())
    class_weight = {
        i: total / (len(CLASSES) * counts[i]) if counts[i] else 1.0
        for i in range(len(CLASSES))
    }

    model, base = build_model(len(CLASSES))
    loss = tf.keras.losses.CategoricalCrossentropy(label_smoothing=LABEL_SMOOTHING)
    verbose = 0 if quiet else 1

    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss=loss, metrics=["accuracy"])
    model.fit(train_ds, validation_data=val_ds, epochs=args.epochs_head,
              class_weight=class_weight, verbose=verbose)

    base.trainable = True
    for layer in base.layers[:-20]:
        layer.trainable = False
    for layer in base.layers:
        if isinstance(layer, tf.keras.layers.BatchNormalization):
            layer.trainable = False
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-5), loss=loss, metrics=["accuracy"])
    model.fit(train_ds, validation_data=val_ds, epochs=args.epochs_ft,
              class_weight=class_weight, verbose=verbose)
    return model


def main() -> None:
    parser = argparse.ArgumentParser(description="K-fold CV on real field photos.")
    parser.add_argument("--corpus-dir", type=Path, default=ML_ROOT / "data" / "images_prepared")
    parser.add_argument("--real-dir", type=Path, default=ML_ROOT / "data" / "images_eval")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--epochs-head", type=int, default=5)
    parser.add_argument("--epochs-ft", type=int, default=5)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--final-model", action="store_true",
                        help="After CV, refit on corpus + ALL real photos and save the "
                             "deployable model. The CV numbers remain the honest estimate.")
    args = parser.parse_args()

    # _degrade() resizes to train_resnet50.IMG_SIZE, so a different --img-size here would feed
    # 224px tensors into a model built for another input shape.
    from train_resnet50 import IMG_SIZE as TRAIN_IMG_SIZE  # noqa: E402

    if args.img_size != TRAIN_IMG_SIZE[0]:
        print(f"--img-size must be {TRAIN_IMG_SIZE[0]} to match train_resnet50.IMG_SIZE "
              f"(the shared augmentation is written against it).", file=sys.stderr)
        sys.exit(1)

    corpus = list_split(args.corpus_dir / "train") + list_split(args.corpus_dir / "val")
    real = list_split(args.real_dir)
    if not real:
        print(f"No real photos under {args.real_dir}.", file=sys.stderr)
        sys.exit(1)
    if not corpus:
        print(f"No corpus images under {args.corpus_dir}.", file=sys.stderr)
        sys.exit(1)

    print(f"corpus : {len(corpus):,} images  {dict(Counter(CLASSES[y] for _p, y in corpus))}",
          file=sys.stderr)
    print(f"real   : {len(real):,} images  {dict(Counter(CLASSES[y] for _p, y in real))}",
          file=sys.stderr)
    print(f"\n{args.folds}-fold CV: each fold trains on corpus + {args.folds - 1} real folds, "
          f"tests on the held-out real fold.\n", file=sys.stderr)

    import numpy as np

    folds = stratified_folds(real, args.folds, args.seed)
    y_true = np.zeros(len(real), dtype=int)
    y_pred = np.full(len(real), -1, dtype=int)
    fold_acc: list[float] = []

    for k, test_idx in enumerate(folds):
        train_idx = [i for i in range(len(real)) if i not in set(test_idx)]
        train_items = corpus + [real[i] for i in train_idx]
        test_items = [real[i] for i in test_idx]
        print(f"--- fold {k + 1}/{args.folds}: train {len(train_items):,} "
              f"(corpus {len(corpus):,} + real {len(train_idx)}), test {len(test_items)}",
              file=sys.stderr)

        model = fit_model(train_items, None, args)
        test_ds = make_dataset(test_items, args.batch, False, args.img_size)
        probs = model.predict(test_ds, verbose=0)
        preds = probs.argmax(axis=1)

        correct = 0
        for pos, i in enumerate(test_idx):
            y_true[i] = real[i][1]
            y_pred[i] = int(preds[pos])
            correct += int(y_pred[i] == y_true[i])
        acc = correct / len(test_idx)
        fold_acc.append(acc)
        print(f"    fold accuracy: {acc:.3f}", file=sys.stderr)

        del model
        import tensorflow as tf
        tf.keras.backend.clear_session()

    # --- Aggregate: every photo predicted exactly once, by a model that never saw it ---
    cm = [[0] * len(CLASSES) for _ in CLASSES]
    for t, p in zip(y_true, y_pred, strict=True):
        cm[t][p] += 1

    width = max(len(c) for c in CLASSES) + 2
    print("\n=== Aggregate confusion matrix (rows = true, cols = predicted) ===")
    print(" " * width + "".join(f"{c:>{width}}" for c in CLASSES))
    for i, c in enumerate(CLASSES):
        print(f"{c:<{width}}" + "".join(f"{v:>{width}}" for v in cm[i]))

    print("\n=== Per-class (95% Wilson intervals) ===")
    print(f"{'class':<12}{'n':>5}{'precision':>24}{'recall':>24}{'F1':>8}")
    per_class = {}
    f1s = []
    for i, c in enumerate(CLASSES):
        tp = cm[i][i]
        support = sum(cm[i])
        predicted = sum(cm[r][i] for r in range(len(CLASSES)))
        prec = tp / predicted if predicted else 0.0
        rec = tp / support if support else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        f1s.append(f1)
        p_lo, p_hi = wilson(tp, predicted)
        r_lo, r_hi = wilson(tp, support)
        print(f"{c:<12}{support:>5}"
              f"{f'{prec:.3f} [{p_lo:.2f}-{p_hi:.2f}]':>24}"
              f"{f'{rec:.3f} [{r_lo:.2f}-{r_hi:.2f}]':>24}{f1:>8.3f}")
        per_class[c] = {"support": support, "precision": prec, "recall": rec, "f1": f1,
                        "precision_ci95": [p_lo, p_hi], "recall_ci95": [r_lo, r_hi]}

    correct = sum(cm[i][i] for i in range(len(CLASSES)))
    n = len(real)
    accuracy = correct / n
    a_lo, a_hi = wilson(correct, n)
    macro_f1 = sum(f1s) / len(f1s)
    support_counts = Counter(int(y) for y in y_true)
    majority = max(support_counts.values()) / n

    print("\n=== Overall (out-of-sample, all folds pooled) ===")
    print(f"  accuracy   : {accuracy:.3f}  [{a_lo:.2f}-{a_hi:.2f}]  ({correct}/{n})")
    print(f"  macro F1   : {macro_f1:.3f}")
    print(f"  baseline   : {majority:.3f}  (always predict the majority class)")
    print(f"  vs baseline: {accuracy - majority:+.3f}")
    print(f"  per-fold accuracy: {', '.join(f'{a:.3f}' for a in fold_acc)}")
    print(f"  fold spread: min {min(fold_acc):.3f} / max {max(fold_acc):.3f}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = ML_ROOT / "artifacts" / f"kfold_{stamp}.json"
    out.write_text(json.dumps({
        "evaluated_at_utc": datetime.now(timezone.utc).isoformat(),
        "folds": args.folds,
        "corpus_images": len(corpus),
        "real_images": len(real),
        "class_names": CLASSES,
        "confusion_matrix": cm,
        "per_class": per_class,
        "accuracy": accuracy, "accuracy_ci95": [a_lo, a_hi],
        "macro_f1": macro_f1,
        "baseline_accuracy": majority,
        "per_fold_accuracy": fold_acc,
    }, indent=2), encoding="utf-8")
    print(f"\nWrote {out}")

    if args.final_model:
        print("\n--- refitting on corpus + ALL real photos for deployment ---", file=sys.stderr)
        model = fit_model(corpus + real, None, args)
        artifacts = ML_ROOT / "artifacts"
        artifacts.mkdir(parents=True, exist_ok=True)
        for mode in ("pre", "post"):
            path = artifacts / f"resnet50_{mode}.keras"
            model.save(path)
            meta = {
                "model_key": f"resnet50_{mode}",
                "mode": mode,
                "trained_at_utc": datetime.now(timezone.utc).isoformat(),
                "class_names": CLASSES,
                "post_class_mapping": PRE_TO_POST if mode == "post" else None,
                "image_size": [args.img_size, args.img_size],
                "training": "corpus + all real field photos (k-fold refit)",
                "kfold_accuracy": accuracy,
                "kfold_macro_f1": macro_f1,
                "kfold_report": str(out),
                "note": ("Both phases share one severity model; the ATC-20 names are a "
                         "documented remap of the FEMA P-154 ones. Honest performance is the "
                         "k-fold figure, not a score on data this model was fitted to."),
            }
            (artifacts / f"resnet50_{mode}_metadata.json").write_text(
                json.dumps(meta, indent=2), encoding="utf-8")
            print(f"  saved {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
