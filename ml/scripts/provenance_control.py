"""Control experiment: how much of the model's accuracy is explainable by provenance alone?

Why this exists
---------------
The real-photo set is not provenance-homogeneous. The `low` and `moderate` photos and nine
of the `high` photos were shot on the researcher's phone at 8-12 megapixels; the 28 severe
photos added later were sourced from the web at a median of 0.3 MP. Resolution, file size
and sharpness therefore carry class information that has nothing to do with damage.

This is the same failure that produced 0.9975 validation macro F1 and 0.074 accuracy on real
photos: the classes were separable by where the images came from, so the network read the
source instead of the building.

What it does
------------
Fits a classifier on provenance metadata ONLY -- width, height, megapixels, file size,
aspect ratio, pixel standard deviation -- using the exact folds `kfold_real.py` uses. No
pixels are shown to it beyond a single contrast statistic.

How to read the result
----------------------
Whatever accuracy this reaches is available to the CNN for free, without learning anything
about damage. Compare it against the k-fold CNN numbers:

  * CNN >> control      the CNN learned something the metadata does not encode.
  * CNN ~= control      the CNN's score is consistent with reading provenance. Any
                        improvement in `high` recall is not evidence of improved damage
                        detection.

It is a floor for suspicion, not proof of cheating. Report both numbers together.

Usage (from repo root, with the backend venv):
  backend/.venv/Scripts/python.exe ml/scripts/provenance_control.py
  backend/.venv/Scripts/python.exe ml/scripts/provenance_control.py --folds 5 --seed 42

Reads:  ml/data/images_eval/    (built by build_eval_set.py)
Writes: ml/artifacts/provenance_control_<timestamp>.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
ML_ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from kfold_real import CLASSES, list_split, stratified_folds, wilson  # noqa: E402

FEATURE_NAMES = ["width", "height", "megapixels", "kilobytes", "aspect_ratio", "pixel_std"]


def features(path: Path) -> list[float]:
    with Image.open(path) as im:
        w, h = im.size
        gray = np.asarray(im.convert("L"), dtype=np.float32)
    return [
        float(w),
        float(h),
        w * h / 1e6,
        path.stat().st_size / 1024.0,
        w / h if h else 0.0,
        float(gray.std()),
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Provenance-only control for the image model.")
    parser.add_argument("--real-dir", type=Path, default=ML_ROOT / "data" / "images_eval")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--only", nargs="+", metavar="FEATURE", choices=FEATURE_NAMES,
                        help=f"Restrict to a subset of {FEATURE_NAMES}. Use "
                             f"'--only width height megapixels aspect_ratio' for a pure-geometry "
                             f"run: those are unambiguously provenance, whereas kilobytes and "
                             f"pixel_std also respond to genuine damage texture.")
    args = parser.parse_args()

    used = list(args.only) if args.only else FEATURE_NAMES
    keep = [FEATURE_NAMES.index(f) for f in used]

    from sklearn.ensemble import RandomForestClassifier

    real = list_split(args.real_dir)
    if not real:
        print(f"No images under {args.real_dir}. Run build_eval_set.py first.", file=sys.stderr)
        sys.exit(1)

    print(f"real photos: {len(real)}  {dict(Counter(CLASSES[y] for _p, y in real))}\n",
          file=sys.stderr)

    X = np.array([features(p) for p, _y in real], dtype=np.float64)[:, keep]
    y = np.array([y for _p, y in real], dtype=int)

    print(f"features in use: {', '.join(used)}\n", file=sys.stderr)
    print("=== Provenance by class (median) ===")
    print(f"{'class':<10}{'n':>5}" + "".join(f"{f:>14}" for f in used))
    for i, cls in enumerate(CLASSES):
        rows = X[y == i]
        if not len(rows):
            continue
        med = np.median(rows, axis=0)
        print(f"{cls:<10}{len(rows):>5}" + "".join(f"{v:>14.2f}" for v in med))

    # Same folds as kfold_real.py, so the two runs are directly comparable.
    folds = stratified_folds(real, args.folds, args.seed)
    y_pred = np.full(len(real), -1, dtype=int)

    for test_idx in folds:
        train_idx = [i for i in range(len(real)) if i not in set(test_idx)]
        clf = RandomForestClassifier(
            n_estimators=300, class_weight="balanced", random_state=args.seed, n_jobs=-1
        )
        clf.fit(X[train_idx], y[train_idx])
        y_pred[test_idx] = clf.predict(X[test_idx])

    cm = [[0] * len(CLASSES) for _ in CLASSES]
    for t, p in zip(y, y_pred, strict=True):
        cm[t][p] += 1

    width = max(len(c) for c in CLASSES) + 2
    print("\n=== Confusion matrix, metadata only (rows = true, cols = predicted) ===")
    print(" " * width + "".join(f"{c:>{width}}" for c in CLASSES))
    for i, c in enumerate(CLASSES):
        print(f"{c:<{width}}" + "".join(f"{v:>{width}}" for v in cm[i]))

    print("\n=== Per-class, metadata only (95% Wilson intervals) ===")
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
    majority = max(Counter(int(v) for v in y).values()) / n

    print("\n=== Metadata-only ceiling (out-of-sample) ===")
    print(f"  accuracy   : {accuracy:.3f}  [{a_lo:.2f}-{a_hi:.2f}]  ({correct}/{n})")
    print(f"  macro F1   : {macro_f1:.3f}")
    print(f"  baseline   : {majority:.3f}  (always predict the majority class)")
    print(f"\n  A CNN scoring at or below these figures has not been shown to read damage.")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = ML_ROOT / "artifacts" / f"provenance_control_{stamp}.json"
    out.write_text(json.dumps({
        "evaluated_at_utc": datetime.now(timezone.utc).isoformat(),
        "folds": args.folds,
        "seed": args.seed,
        "real_images": n,
        "features": used,
        "class_names": CLASSES,
        "confusion_matrix": cm,
        "per_class": per_class,
        "accuracy": accuracy, "accuracy_ci95": [a_lo, a_hi],
        "macro_f1": macro_f1,
        "baseline_accuracy": majority,
    }, indent=2), encoding="utf-8")
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
