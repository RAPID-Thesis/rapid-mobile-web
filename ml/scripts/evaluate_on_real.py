"""
Evaluate a trained ResNet50 against a held-out image set, honestly.

The metrics stored in ml/artifacts/resnet50_*_metadata.json (macro F1 = 0.9975) came from a
validation split of a corpus whose classes were defined by *source dataset* rather than by
damage severity, so they measure the model's ability to tell datasets apart. This script
reports what the model does on images it has never seen, with the caveats made explicit:

  - **Wilson confidence intervals** on every rate. With ~11 images in a class, a point
    estimate is close to meaningless; the interval shows how little is actually known.
  - **A majority-class baseline.** A model that always predicts the largest class gets a
    specific accuracy for free -- any claim of skill has to beat it.
  - **Collapse detection.** If nearly all predictions land on one class, that is reported
    outright, since it is the expected failure mode under domain shift.

Preprocessing and model loading are imported from the backend fusion engine, so the
evaluation path is byte-for-byte the serving path rather than a reimplementation of it.

Usage (from repo root, with the backend venv):
  backend/.venv/Scripts/python.exe ml/scripts/evaluate_on_real.py
  backend/.venv/Scripts/python.exe ml/scripts/evaluate_on_real.py --phase post
  backend/.venv/Scripts/python.exe ml/scripts/evaluate_on_real.py --data-dir ml/data/images_prepared/val

Reads:  ml/data/images_eval/{low,moderate,high}/   (from scripts/build_eval_set.py)
Writes: ml/artifacts/eval_<phase>_<timestamp>.json
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml"
sys.path.insert(0, str(REPO_ROOT / "backend"))

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Pre-EQ class names are what the folders use; post-EQ is the documented remap of the same
# severity signal (see ml/artifacts/resnet50_post_metadata.json).
PRE_TO_POST = {"low": "SAFE", "moderate": "RESTRICTED", "high": "UNSAFE"}


def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval -- valid at small n, unlike the normal approximation."""
    if total == 0:
        return (0.0, 0.0)
    p = successes / total
    denom = 1 + z**2 / total
    center = (p + z**2 / (2 * total)) / denom
    margin = z * math.sqrt(p * (1 - p) / total + z**2 / (4 * total**2)) / denom
    return (max(0.0, center - margin), min(1.0, center + margin))


def tile_image(raw: bytes, grid: int) -> list["object"]:
    """Return the whole frame plus a grid x grid set of overlapping crops, each 224x224.

    Training images are tight crops where the damage fills the frame; field photos are wide
    scenes where a crack occupies a few percent of the pixels. Resizing a whole scene to 224
    shrinks the damage to near-nothing, so the network sees a texture it was never trained on.
    Tiling restores the training framing: at least one tile contains the damage at a
    comparable scale.
    """
    from io import BytesIO

    import numpy as np
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(BytesIO(raw)).convert("RGB"))
    w, h = img.size
    out = []

    # Whole frame, centre-cropped square -- identical to the serving path.
    side = min(w, h)
    whole = img.crop(((w - side) // 2, (h - side) // 2,
                      (w - side) // 2 + side, (h - side) // 2 + side))
    out.append(np.asarray(whole.resize((224, 224), Image.BILINEAR), dtype=np.uint8))

    if grid < 2:
        return out

    # Overlapping tiles: step half a tile so damage on a boundary still lands inside one.
    tile_w, tile_h = w / grid, h / grid
    step_x, step_y = tile_w / 2, tile_h / 2
    y = 0.0
    while y + tile_h <= h + 1e-6:
        x = 0.0
        while x + tile_w <= w + 1e-6:
            crop = img.crop((int(x), int(y), int(x + tile_w), int(y + tile_h)))
            out.append(np.asarray(crop.resize((224, 224), Image.BILINEAR), dtype=np.uint8))
            x += step_x
        y += step_y
    return out


def collect(data_dir: Path, classes: list[str]) -> list[tuple[Path, str]]:
    items: list[tuple[Path, str]] = []
    for cls in classes:
        d = data_dir / cls
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES:
                items.append((f, cls))
    return items


def main() -> None:
    parser = argparse.ArgumentParser(description="Honest evaluation on held-out images.")
    parser.add_argument("--data-dir", type=Path, default=ML_ROOT / "data" / "images_eval")
    parser.add_argument("--phase", choices=["pre", "post"], default="pre")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--deploy-prior", default=None,
                        help="Comma-separated deployment class priors in low,moderate,high order "
                             "(e.g. 0.10,0.85,0.05). Rescales predictions by "
                             "prior_deploy/prior_train to correct for the training corpus being "
                             "enriched for severe damage. The prior is an ASSUMPTION and is "
                             "printed with the results.")
    parser.add_argument("--train-manifest", type=Path,
                        default=ML_ROOT / "data" / "images_prepared" / "manifest.csv",
                        help="Used to read the training priors for the correction.")
    parser.add_argument("--tiles", type=int, default=1,
                        help="Split each photo into an NxN overlapping grid and keep the most "
                             "severe tile. 1 = whole frame only (the current serving path).")
    args = parser.parse_args()

    from app.services.ml_fusion_engine import (  # noqa: E402
        MODEL_DIR, _classes_for, _load_resnet, _preprocess_image, _resnet_output_classes,
    )

    classes = list(_classes_for(args.phase))
    # Folders are named with pre-EQ labels regardless of the phase under test.
    folder_classes = ["low", "moderate", "high"]
    to_model_label = PRE_TO_POST if args.phase == "post" else {c: c for c in folder_classes}

    items = collect(args.data_dir, folder_classes)
    if not items:
        print(f"No images under {args.data_dir}.", file=sys.stderr)
        print("Build the eval set first: ml/scripts/build_eval_set.py --src <folder>",
              file=sys.stderr)
        sys.exit(1)

    counts = Counter(c for _, c in items)
    print(f"Evaluating {len(items)} image(s) from {args.data_dir}", file=sys.stderr)
    for c in folder_classes:
        print(f"  {c:<9} {counts.get(c, 0):>5}", file=sys.stderr)
    print(f"\nModel: {MODEL_DIR / f'resnet50_{args.phase}.keras'}", file=sys.stderr)
    print("Loading TensorFlow (first call takes 30-120 s) ...", file=sys.stderr)

    import numpy as np

    model = _load_resnet(args.phase)

    y_true: list[str] = []
    y_pred: list[str] = []
    confidences: list[float] = []

    output_classes = list(_resnet_output_classes(args.phase))
    # Severity rank drives tile aggregation: the rubric says label the WORST damage visible,
    # so the winning tile is the most severe one, not the most confident one.
    severity = {c: i for i, c in enumerate(
        ["low", "moderate", "high"] if args.phase == "pre" else ["SAFE", "RESTRICTED", "UNSAFE"]
    )}

    if args.tiles > 1:
        print(f"  tiled inference: whole frame + {args.tiles}x{args.tiles} overlapping tiles",
              file=sys.stderr)

    # --- Optional prior correction ---------------------------------------------------
    # The training corpus is a curated damage dataset (25% high); a real barangay survey is
    # mostly moderate. A model fitted to the former systematically over-predicts severity on
    # the latter. Rescaling by prior_deploy/prior_train removes that bias without retraining.
    prior_ratio: dict[str, float] | None = None
    if args.deploy_prior:
        folder_order = ["low", "moderate", "high"]
        try:
            deploy = [float(x) for x in args.deploy_prior.split(",")]
            if len(deploy) != 3 or any(p <= 0 for p in deploy):
                raise ValueError
        except ValueError:
            print("--deploy-prior needs three positive numbers: low,moderate,high", file=sys.stderr)
            sys.exit(1)
        total = sum(deploy)
        deploy = [p / total for p in deploy]

        train_counts = Counter()
        with args.train_manifest.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if row["split"] == "train":
                    train_counts[row["label"]] += 1
        n_train = sum(train_counts.values())
        if not n_train:
            print(f"No training rows in {args.train_manifest}", file=sys.stderr)
            sys.exit(1)

        prior_ratio = {}
        print("\n  prior correction (ASSUMPTION -- stated, not measured):", file=sys.stderr)
        for folder_cls, p_deploy in zip(folder_order, deploy, strict=True):
            p_train = train_counts[folder_cls] / n_train
            model_cls = to_model_label[folder_cls]
            prior_ratio[model_cls] = p_deploy / p_train
            print(f"    {folder_cls:<9} train {p_train:5.1%}  ->  assumed field {p_deploy:5.1%}"
                  f"   x{p_deploy / p_train:5.2f}", file=sys.stderr)

    for n_done, (path, cls) in enumerate(items, start=1):
        try:
            raw = path.read_bytes()
            views = tile_image(raw, args.tiles) if args.tiles > 1 else [_preprocess_image(raw)]
        except Exception as exc:  # noqa: BLE001
            print(f"  ! skipped {path.name}: {exc}", file=sys.stderr)
            continue

        probs = model.predict(np.stack(views, axis=0), verbose=0)
        best_rank, best_conf, best_label = -1, 0.0, classes[0]
        for row in probs:
            by_class = {c: float(p) for c, p in zip(output_classes, row, strict=True)}
            if prior_ratio:
                by_class = {c: p * prior_ratio[c] for c, p in by_class.items()}
                z = sum(by_class.values()) or 1.0
                by_class = {c: p / z for c, p in by_class.items()}
            label = max(classes, key=lambda c: by_class[c])
            rank = severity.get(label, 0)
            if rank > best_rank or (rank == best_rank and by_class[label] > best_conf):
                best_rank, best_conf, best_label = rank, by_class[label], label

        y_true.append(to_model_label[cls])
        y_pred.append(best_label)
        confidences.append(best_conf)
        if n_done % 32 == 0 or n_done == len(items):
            print(f"  {n_done}/{len(items)}", file=sys.stderr)

    n = len(y_true)
    if n == 0:
        print("Nothing could be evaluated.", file=sys.stderr)
        sys.exit(1)

    # --- Confusion matrix ---
    index = {c: i for i, c in enumerate(classes)}
    cm = [[0] * len(classes) for _ in classes]
    for t, p in zip(y_true, y_pred, strict=True):
        cm[index[t]][index[p]] += 1

    width = max(len(c) for c in classes) + 2
    print("\n=== Confusion matrix (rows = true, cols = predicted) ===")
    print(" " * width + "".join(f"{c:>{width}}" for c in classes))
    for i, c in enumerate(classes):
        print(f"{c:<{width}}" + "".join(f"{v:>{width}}" for v in cm[i]))

    # --- Per-class metrics ---
    print("\n=== Per-class (95% Wilson intervals) ===")
    print(f"{'class':<14}{'n':>5}{'precision':>24}{'recall':>24}{'F1':>8}")
    per_class: dict[str, dict[str, float | int | list[float]]] = {}
    f1s: list[float] = []
    for i, c in enumerate(classes):
        tp = cm[i][i]
        support = sum(cm[i])
        predicted = sum(cm[r][i] for r in range(len(classes)))
        prec = tp / predicted if predicted else 0.0
        rec = tp / support if support else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        f1s.append(f1)
        p_lo, p_hi = wilson(tp, predicted)
        r_lo, r_hi = wilson(tp, support)
        print(f"{c:<14}{support:>5}"
              f"{f'{prec:.3f} [{p_lo:.2f}-{p_hi:.2f}]':>24}"
              f"{f'{rec:.3f} [{r_lo:.2f}-{r_hi:.2f}]':>24}"
              f"{f1:>8.3f}")
        per_class[c] = {
            "support": support, "predicted": predicted, "true_positives": tp,
            "precision": prec, "precision_ci95": [p_lo, p_hi],
            "recall": rec, "recall_ci95": [r_lo, r_hi], "f1": f1,
        }

    correct = sum(cm[i][i] for i in range(len(classes)))
    accuracy = correct / n
    a_lo, a_hi = wilson(correct, n)
    macro_f1 = sum(f1s) / len(f1s)

    # --- Baseline and collapse ---
    support_counts = Counter(y_true)
    majority_label, majority_n = support_counts.most_common(1)[0]
    baseline_acc = majority_n / n
    pred_counts = Counter(y_pred)
    top_pred, top_pred_n = pred_counts.most_common(1)[0]
    collapse_ratio = top_pred_n / n

    print(f"\n=== Overall ===")
    print(f"  accuracy      : {accuracy:.3f}  [{a_lo:.2f}-{a_hi:.2f}]  ({correct}/{n})")
    print(f"  macro F1      : {macro_f1:.3f}")
    print(f"  baseline      : {baseline_acc:.3f}  (always predict '{majority_label}')")
    print(f"  vs baseline   : {accuracy - baseline_acc:+.3f}")
    print(f"  mean confidence: {sum(confidences) / n:.3f}")
    print(f"  prediction spread: {dict(pred_counts)}")

    if collapse_ratio >= 0.90:
        print(f"\n  !! COLLAPSE: {collapse_ratio:.0%} of predictions are '{top_pred}'. "
              f"The model is not discriminating on this data.")
    if accuracy <= baseline_acc:
        print(f"  !! No skill: accuracy does not beat always-predict-'{majority_label}'.")
    if any(v["support"] and v["support"] < 30 for v in per_class.values()):
        print("  !! Some classes have <30 images -- quote the intervals, not the point estimates.")

    # --- Persist ---
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = args.out or ML_ROOT / "artifacts" / f"eval_{args.phase}_{stamp}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "evaluated_at_utc": datetime.now(timezone.utc).isoformat(),
        "phase": args.phase,
        "model": str((MODEL_DIR / f"resnet50_{args.phase}.keras").resolve()),
        "data_dir": str(args.data_dir.resolve()),
        "n_images": n,
        "class_names": classes,
        "confusion_matrix": cm,
        "per_class": per_class,
        "accuracy": accuracy, "accuracy_ci95": [a_lo, a_hi],
        "macro_f1": macro_f1,
        "baseline_accuracy": baseline_acc, "baseline_label": majority_label,
        "mean_confidence": sum(confidences) / n,
        "prediction_counts": dict(pred_counts),
        "collapse_ratio": collapse_ratio,
    }, indent=2), encoding="utf-8")
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
