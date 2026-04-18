"""
Balance and split the raw image dataset for ResNet50 training WITHOUT data leakage.

Leakage-safe pipeline:
  1. Split ORIGINALS first (80/20 stratified) per class.
  2. Within the train split only, augment the minority class to match the target.
  3. Downsample majority classes in each split independently.
  4. Val set contains ONLY untouched originals — no augmented copies of train images.

Usage (from ml/):
  python scripts/prepare_image_dataset.py

Reads:  data/images/train/{low,moderate,high}/*.jpg  (raw user-provided images)
Writes: data/images_prepared/train/{low,moderate,high}/*.jpg
        data/images_prepared/val/{low,moderate,high}/*.jpg
"""

from __future__ import annotations

import argparse
import hashlib
import random
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

TRAIN_TARGET_PER_CLASS = 3200
VAL_FRACTION = 0.20


def augment_image(img: Image.Image, rng: random.Random) -> Image.Image:
    """Apply random augmentations to a PIL image."""
    if rng.random() < 0.5:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    angle = rng.uniform(-25, 25)
    img = img.rotate(angle, resample=Image.BILINEAR, fillcolor=(0, 0, 0))
    factor = rng.uniform(0.65, 1.45)
    img = ImageEnhance.Brightness(img).enhance(factor)
    factor = rng.uniform(0.65, 1.35)
    img = ImageEnhance.Contrast(img).enhance(factor)
    if rng.random() < 0.4:
        img = img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.5, 2.0)))
    factor = rng.uniform(0.7, 1.3)
    img = ImageEnhance.Color(img).enhance(factor)
    if rng.random() < 0.2:
        img = img.filter(ImageFilter.SHARPEN)
    return img


def stable_hash(path: Path) -> str:
    return hashlib.md5(str(path.name).encode()).hexdigest()


def split_originals(
    src_dir: Path, val_fraction: float, rng: random.Random
) -> tuple[list[Path], list[Path]]:
    """Stratified per-class split of original files (no duplicates across train/val)."""
    files = sorted(src_dir.glob("*.jpg")) + sorted(src_dir.glob("*.jpeg")) + sorted(src_dir.glob("*.png"))
    if not files:
        raise ValueError(f"No images found in {src_dir}")
    rng.shuffle(files)
    n_val = max(1, int(len(files) * val_fraction))
    return files[n_val:], files[:n_val]


def populate_split(
    originals: list[Path],
    dst_dir: Path,
    target: int,
    rng: random.Random,
    augment: bool,
) -> int:
    """
    Copy originals into dst_dir; if fewer than target AND augment=True, augment to fill.
    If more than target, downsample. Returns final count.
    """
    dst_dir.mkdir(parents=True, exist_ok=True)

    if len(originals) >= target:
        selected = rng.sample(originals, target)
        for i, src in enumerate(selected):
            shutil.copy2(src, dst_dir / f"orig_{i:05d}.jpg")
        return target

    for i, src in enumerate(originals):
        shutil.copy2(src, dst_dir / f"orig_{i:05d}.jpg")

    if not augment:
        return len(originals)

    needed = target - len(originals)
    print(f"  Augmenting {needed} images from {len(originals)} train originals...", file=sys.stderr)
    for i in range(needed):
        src = rng.choice(originals)
        img = Image.open(src).convert("RGB")
        img = augment_image(img, rng)
        img.save(dst_dir / f"aug_{i:05d}.jpg", "JPEG", quality=90)

    return target


def main() -> None:
    parser = argparse.ArgumentParser(description="Balance and split image dataset (leakage-safe).")
    parser.add_argument("--raw-dir", type=Path,
                        default=Path(__file__).resolve().parent.parent / "data" / "images" / "train")
    parser.add_argument("--out-dir", type=Path,
                        default=Path(__file__).resolve().parent.parent / "data" / "images_prepared")
    parser.add_argument("--train-target", type=int, default=TRAIN_TARGET_PER_CLASS,
                        help=f"Target train images per class (default {TRAIN_TARGET_PER_CLASS})")
    parser.add_argument("--val-frac", type=float, default=VAL_FRACTION)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rng = random.Random(args.seed)

    if args.out_dir.exists():
        print(f"Removing existing prepared dir: {args.out_dir}", file=sys.stderr)
        shutil.rmtree(args.out_dir)

    classes = sorted([d.name for d in args.raw_dir.iterdir() if d.is_dir()])
    if not classes:
        print(f"No class subdirectories found in {args.raw_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Classes: {classes}", file=sys.stderr)
    print(f"Train target per class: {args.train_target}, val fraction: {args.val_frac}", file=sys.stderr)
    print("Leakage-safe: originals split first, augmentation applied ONLY to train.\n", file=sys.stderr)

    summary: dict[str, dict[str, int]] = {}

    for cls in classes:
        src = args.raw_dir / cls
        n_src = len(list(src.glob("*.jpg")))
        print(f"\n[{cls}] {n_src} source images", file=sys.stderr)

        train_orig, val_orig = split_originals(src, args.val_frac, rng)
        print(f"  Original split -> train: {len(train_orig)}, val: {len(val_orig)}", file=sys.stderr)

        # Val target = whatever originals we have (capped at a reasonable max if class is huge)
        val_target = min(len(val_orig), 800)
        val_count = populate_split(
            val_orig, args.out_dir / "val" / cls, val_target, rng, augment=False
        )

        train_count = populate_split(
            train_orig, args.out_dir / "train" / cls, args.train_target, rng, augment=True
        )

        summary[cls] = {"train": train_count, "val": val_count}

    print("\n=== Final dataset ===", file=sys.stderr)
    for cls, counts in summary.items():
        print(f"  {cls}: train={counts['train']}, val={counts['val']}", file=sys.stderr)
    print(f"\nWritten to: {args.out_dir}", file=sys.stderr)


if __name__ == "__main__":
    main()
