"""
Build the train/val split from hand-assigned SEVERITY labels, without leakage.

Replaces the earlier version, which derived labels from the source folder name. That made
each class a different dataset -- `low` was the Mendeley "Negative" split, `moderate` its
"Positive" split, `high` a separate Roboflow export at another resolution -- so the model
scored 0.9975 by telling datasets apart and 0.074 on real field photos.

What this version guarantees:

  1. **Labels come from ml/data/image_labels.csv** (severity, assigned by eye against
     ml/labeling_rubric.md), not from directory names.
  2. **Splits are grouped by `group_id`.** Near-duplicate copies of one photo -- Roboflow
     ships several augmented versions of the same source image -- always land on the same
     side of the split. A random per-file split silently leaks them across both.
  3. **The class x pool matrix is printed.** `low` currently comes almost entirely from
     Pool A (227px lab crops) while `moderate`/`high` come from Pool C (640px photos), so
     resolution remains a usable shortcut. This is reported every run rather than discovered
     after training; the countermeasure is the degradation augmentation in train_resnet50.py.
  4. **junk/skip are excluded** but counted, so nothing disappears silently.

Usage (from repo root, with the backend venv):
  backend/.venv/Scripts/python.exe ml/scripts/prepare_image_dataset.py
  backend/.venv/Scripts/python.exe ml/scripts/prepare_image_dataset.py --val-frac 0.25

Reads:  ml/data/image_labels.csv   (from scripts/relabel_workspace.py merge)
Writes: ml/data/images_prepared/{train,val}/{low,moderate,high}/
        ml/data/images_prepared/manifest.csv
"""

from __future__ import annotations

import argparse
import csv
import random
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageOps

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:  # pragma: no cover
    pass

ML_ROOT = Path(__file__).resolve().parent.parent
LABELS_CSV = ML_ROOT / "data" / "image_labels.csv"
OUT_DIR = ML_ROOT / "data" / "images_prepared"

TRAIN_CLASSES = ["low", "moderate", "high"]
EXCLUDED = ["junk", "skip"]


def load_labels() -> list[dict[str, str]]:
    if not LABELS_CSV.exists():
        print(f"Missing {LABELS_CSV}.\n"
              f"  Run: relabel_workspace.py collect-team --pool C\n"
              f"       relabel_workspace.py merge", file=sys.stderr)
        sys.exit(1)
    with LABELS_CSV.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def main() -> None:
    parser = argparse.ArgumentParser(description="Group-aware train/val split from severity labels.")
    parser.add_argument("--val-frac", type=float, default=0.20)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--cap-per-class", type=int, default=None,
                        help="Cap groups per class in TRAIN (val is left untouched). Use to stop "
                             "an auto-labeled pool from dominating a class.")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    rows = load_labels()

    excluded_counts = Counter(r["label"] for r in rows if r["label"] in EXCLUDED)
    rows = [r for r in rows if r["label"] in TRAIN_CLASSES]
    if not rows:
        print("No rows with a trainable label (low/moderate/high).", file=sys.stderr)
        sys.exit(1)

    # One label per group. A group is one photo plus its near-duplicates, so it must not be
    # split across train and val, and it cannot hold two different labels.
    group_label: dict[str, str] = {}
    group_pool: dict[str, str] = {}
    group_files: dict[str, list[str]] = defaultdict(list)
    contradictions: set[str] = set()
    for r in rows:
        gid = r["group_id"]
        if gid in group_label and group_label[gid] != r["label"]:
            contradictions.add(gid)
        group_label[gid] = r["label"]
        group_pool[gid] = r["pool"]
        group_files[gid].append(r["path"])

    if contradictions:
        print(f"{len(contradictions)} group(s) carry more than one label -- fix the labels "
              f"before preparing the dataset: {sorted(contradictions)[:10]}", file=sys.stderr)
        sys.exit(1)

    # --- Group-aware, class-stratified, pool-stratified split ---
    rng = random.Random(args.seed)
    by_class_pool: dict[tuple[str, str], list[str]] = defaultdict(list)
    for gid, label in group_label.items():
        by_class_pool[(label, group_pool[gid])].append(gid)

    train_gids: list[str] = []
    val_gids: list[str] = []
    for key, gids in by_class_pool.items():
        gids = sorted(gids, key=lambda g: int(g))
        rng.shuffle(gids)
        # At least one val group per (class, pool) so the val set mirrors the training mix.
        n_val = max(1, round(len(gids) * args.val_frac)) if len(gids) > 1 else 0
        val_gids.extend(gids[:n_val])
        train_gids.extend(gids[n_val:])

    if args.cap_per_class:
        capped: list[str] = []
        per_class: dict[str, list[str]] = defaultdict(list)
        for gid in train_gids:
            per_class[group_label[gid]].append(gid)
        for label, gids in per_class.items():
            if len(gids) > args.cap_per_class:
                rng.shuffle(gids)
                print(f"  capping train '{label}': {len(gids)} -> {args.cap_per_class} groups",
                      file=sys.stderr)
                gids = gids[:args.cap_per_class]
            capped.extend(gids)
        train_gids = capped

    if OUT_DIR.exists():
        if not args.force:
            print(f"{OUT_DIR} exists. Pass --force to rebuild.", file=sys.stderr)
            sys.exit(1)
        shutil.rmtree(OUT_DIR)

    # --- Materialize ---
    manifest: list[list[str]] = []
    counts: Counter[tuple[str, str]] = Counter()
    matrix: Counter[tuple[str, str, str]] = Counter()
    for split, gids in (("train", train_gids), ("val", val_gids)):
        for cls in TRAIN_CLASSES:
            (OUT_DIR / split / cls).mkdir(parents=True, exist_ok=True)
        for gid in gids:
            label = group_label[gid]
            pool = group_pool[gid]
            for i, rel in enumerate(group_files[gid]):
                src = ML_ROOT / rel
                if not src.exists():
                    print(f"  ! missing: {rel}", file=sys.stderr)
                    continue
                dst = OUT_DIR / split / label / f"g{int(gid):06d}_{i}.jpg"
                try:
                    with Image.open(src) as im:
                        im = ImageOps.exif_transpose(im).convert("RGB")
                        im.save(dst, "JPEG", quality=95)
                except Exception as exc:  # noqa: BLE001
                    print(f"  ! could not copy {rel}: {exc}", file=sys.stderr)
                    continue
                counts[(split, label)] += 1
                matrix[(split, label, pool)] += 1
                manifest.append([split, label, pool, gid, dst.relative_to(ML_ROOT).as_posix(), rel])

    with (OUT_DIR / "manifest.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["split", "label", "pool", "group_id", "path", "source_path"])
        w.writerows(manifest)

    # --- Report ---
    print("\n=== Split (files) ===", file=sys.stderr)
    print(f"{'':<10}{'train':>8}{'val':>8}", file=sys.stderr)
    for cls in TRAIN_CLASSES:
        print(f"{cls:<10}{counts[('train', cls)]:>8}{counts[('val', cls)]:>8}", file=sys.stderr)
    print(f"{'TOTAL':<10}{sum(counts[('train', c)] for c in TRAIN_CLASSES):>8}"
          f"{sum(counts[('val', c)] for c in TRAIN_CLASSES):>8}", file=sys.stderr)

    print(f"\n  groups: train={len(train_gids)} val={len(val_gids)} "
          f"(no group appears in both)", file=sys.stderr)
    if excluded_counts:
        print(f"  excluded: {dict(excluded_counts)}", file=sys.stderr)

    print("\n=== class x source pool (train) ===", file=sys.stderr)
    pools = sorted({p for (_s, _c, p) in matrix})
    print(f"{'':<10}" + "".join(f"{p:>8}" for p in pools), file=sys.stderr)
    single_pool: list[str] = []
    for cls in TRAIN_CLASSES:
        cells = [matrix[("train", cls, p)] for p in pools]
        print(f"{cls:<10}" + "".join(f"{v:>8}" for v in cells), file=sys.stderr)
        nonzero = [p for p, v in zip(pools, cells, strict=True) if v]
        if len(nonzero) == 1:
            single_pool.append(f"{cls}->{nonzero[0]}")

    if single_pool:
        print(f"\n  CONFOUND: {', '.join(single_pool)} draw from a single source pool.",
              file=sys.stderr)
        print("  Those classes remain separable by resolution/sharpness alone. train_resnet50.py",
              file=sys.stderr)
        print("  randomizes scale and JPEG quality to suppress it -- verify with --shortcut-probe",
              file=sys.stderr)
        print("  and treat the real measurement as evaluate_on_real.py, not the val split.",
              file=sys.stderr)

    print(f"\nWrote {OUT_DIR}", file=sys.stderr)


if __name__ == "__main__":
    main()
