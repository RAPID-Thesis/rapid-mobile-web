"""
Build the held-out REAL-image evaluation set, and prove it does not overlap training data.

Every metric currently recorded for the image model came from a validation split of the same
source-labeled corpus, so none of it reflects field performance. This script stages the
newly collected field photos as a test set that is never trained on.

Two guarantees it enforces:
  1. **No leakage** -- each candidate is perceptually hashed and compared against the whole
     training corpus (ml/data/image_groups.csv). Matches are reported and, unless
     --allow-overlap is passed, abort the build.
  2. **No metadata shortcuts** -- images are re-encoded without EXIF, so capture device,
     orientation tags, and timestamps cannot leak class information. Pass
     --normalize-long-side when the classes came from different sources, so that raw
     resolution cannot either; scripts/provenance_control.py measures whether it can.

Usage (from repo root, with the backend venv which has Pillow):
  # class-named subfolders (high/ moderate/ low/) under one directory
  backend/.venv/Scripts/python.exe ml/scripts/build_eval_set.py --src "D:/path/to/new_images"

  # or point at each class explicitly
  backend/.venv/Scripts/python.exe ml/scripts/build_eval_set.py \
      --high "D:/photos/severe" --moderate "D:/photos/cracked"

  # mixed-provenance classes: equalize resolution so dimensions carry no label
  backend/.venv/Scripts/python.exe ml/scripts/build_eval_set.py --src ml/data/image_eval \
      --force --normalize-long-side 640

Writes: ml/data/images_eval/{low,moderate,high}/
        ml/data/images_eval/manifest.csv
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import shutil
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps

try:  # iPhone photos arrive as HEIC, which Pillow cannot decode on its own.
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIC_OK = True
except ImportError:  # pragma: no cover
    HEIC_OK = False

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dedupe_images import dhash  # noqa: E402

ML_ROOT = Path(__file__).resolve().parent.parent
EVAL_DIR = ML_ROOT / "data" / "images_eval"
GROUPS_CSV = ML_ROOT / "data" / "image_groups.csv"

CLASSES = ["low", "moderate", "high"]
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".heic", ".heif"}

# Folder names seen in the wild, mapped onto the pre-EQ class names the model emits.
CLASS_ALIASES = {
    "low": "low", "safe": "low", "none": "low", "no_damage": "low", "undamaged": "low",
    "moderate": "moderate", "restricted": "moderate", "medium": "moderate", "minor": "moderate",
    "high": "high", "unsafe": "high", "severe": "high", "major": "high", "collapse": "high",
}


def normalize_class(name: str) -> str | None:
    return CLASS_ALIASES.get(name.strip().lower().replace("-", "_").replace(" ", "_"))


def collect_sources(args: argparse.Namespace) -> dict[str, list[Path]]:
    found: dict[str, list[Path]] = {c: [] for c in CLASSES}

    for cls in CLASSES:
        explicit = getattr(args, cls)
        if explicit:
            d = Path(explicit)
            if not d.is_dir():
                print(f"--{cls}: not a directory: {d}", file=sys.stderr)
                sys.exit(1)
            found[cls].extend(
                sorted(f for f in d.rglob("*") if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES)
            )

    if args.src:
        root = Path(args.src)
        if not root.is_dir():
            print(f"--src: not a directory: {root}", file=sys.stderr)
            sys.exit(1)
        subdirs = [d for d in root.iterdir() if d.is_dir()]
        if not subdirs:
            print(f"--src has no subfolders. Expected class-named subfolders "
                  f"({'/'.join(CLASSES)}), or use --high/--moderate/--low.", file=sys.stderr)
            sys.exit(1)
        for d in subdirs:
            cls = normalize_class(d.name)
            if cls is None:
                print(f"  skipping unrecognized folder: {d.name}", file=sys.stderr)
                continue
            found[cls].extend(
                sorted(f for f in d.rglob("*") if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES)
            )

    return found


def load_training_hashes() -> list[tuple[int, str]]:
    if not GROUPS_CSV.exists():
        return []
    out: list[tuple[int, str]] = []
    with GROUPS_CSV.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            out.append((int(row["dhash"], 16), row["path"]))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage the held-out real-image test set.")
    parser.add_argument("--src", help="Directory containing class-named subfolders.")
    for cls in CLASSES:
        parser.add_argument(f"--{cls}", help=f"Directory of '{cls}' images.")
    parser.add_argument("--leak-threshold", type=int, default=12,
                        help="Hamming distance to the training corpus treated as overlap (default 12)")
    parser.add_argument("--allow-overlap", action="store_true",
                        help="Stage the set even if overlap with training data is detected.")
    parser.add_argument("--force", action="store_true", help="Replace an existing eval set.")
    parser.add_argument("--normalize-long-side", type=int, default=None, metavar="PX",
                        help="Resize every image so its long side is PX before saving, "
                             "equalizing resolution across classes. Use when the classes were "
                             "collected from different sources -- otherwise image dimensions "
                             "alone predict the label (see scripts/provenance_control.py). "
                             "Off by default, which preserves native resolution.")
    parser.add_argument("--square-crop", action="store_true",
                        help="Centre-crop to a square before resizing. Removes aspect ratio as "
                             "a provenance cue (one camera's photos are all 3:4, scraped images "
                             "are not) and matches the square input the model resizes to anyway, "
                             "so classes stop being distorted by different amounts.")
    args = parser.parse_args()

    if args.normalize_long_side is not None and args.normalize_long_side < 224:
        parser.error("--normalize-long-side must be >= 224, the model's input size.")

    if not args.src and not any(getattr(args, c) for c in CLASSES):
        parser.error("Provide --src, or at least one of --high/--moderate/--low.")

    sources = collect_sources(args)
    total = sum(len(v) for v in sources.values())
    if not total:
        print("No images found.", file=sys.stderr)
        sys.exit(1)

    n_heic = sum(1 for v in sources.values() for f in v if f.suffix.lower() in {".heic", ".heif"})
    if n_heic and not HEIC_OK:
        print(f"{n_heic} HEIC/HEIF image(s) found but pillow-heif is not installed, so they "
              f"cannot be decoded.\n  pip install pillow-heif   (see ml/requirements.txt)",
              file=sys.stderr)
        sys.exit(1)
    if n_heic:
        print(f"  ({n_heic} HEIC image(s) will be converted to JPEG)", file=sys.stderr)

    print("Candidate images:", file=sys.stderr)
    for cls in CLASSES:
        print(f"  {cls:<9} {len(sources[cls]):>5}", file=sys.stderr)

    if EVAL_DIR.exists():
        if not args.force:
            print(f"\n{EVAL_DIR} already exists. Pass --force to rebuild.", file=sys.stderr)
            sys.exit(1)
        shutil.rmtree(EVAL_DIR)

    train_hashes = load_training_hashes()
    if train_hashes:
        print(f"\nLeakage check against {len(train_hashes):,} training images ...", file=sys.stderr)
    else:
        print("\n  ! ml/data/image_groups.csv not found -- skipping the leakage check. "
              "Run scripts/dedupe_images.py to enable it.", file=sys.stderr)

    # Byte-identical files filed under two different labels are a contradiction, not a
    # duplicate: silently keeping whichever class is processed first would quietly decide a
    # label on the user's behalf and shrink the rarest class without saying so.
    md5_to_class: dict[str, tuple[str, str]] = {}
    contradictions: list[str] = []
    for cls in CLASSES:
        for src in sources[cls]:
            md5 = hashlib.md5(src.read_bytes()).hexdigest()
            prior = md5_to_class.get(md5)
            if prior and prior[0] != cls:
                contradictions.append(f"{prior[1]} ({prior[0]})  ==  {src.name} ({cls})")
            elif not prior:
                md5_to_class[md5] = (cls, src.name)

    if contradictions:
        print(f"\n  !! {len(contradictions)} image(s) appear under MORE THAN ONE label:",
              file=sys.stderr)
        for line in contradictions:
            print(f"     {line}", file=sys.stderr)
        print("\n  These are the same file with conflicting labels. Delete the wrong copy "
              "and re-run -- a test set cannot contain an image that is both classes.",
              file=sys.stderr)
        sys.exit(1)

    rows: list[list[str]] = []
    overlaps: list[str] = []
    seen_md5: dict[str, str] = {}
    counts: Counter[str] = Counter()

    for cls in CLASSES:
        (EVAL_DIR / cls).mkdir(parents=True, exist_ok=True)
        for i, src in enumerate(sources[cls]):
            raw = src.read_bytes()
            md5 = hashlib.md5(raw).hexdigest()
            if md5 in seen_md5:
                print(f"  duplicate within '{cls}', skipping: {src.name} "
                      f"(same bytes as {seen_md5[md5]})", file=sys.stderr)
                continue
            seen_md5[md5] = src.name

            result = dhash(src)
            if result is None:
                continue
            h, std, width, height = result

            if train_hashes:
                for th, tpath in train_hashes:
                    if (h ^ th).bit_count() <= args.leak_threshold:
                        overlaps.append(f"{src.name}  ~=  {tpath}")
                        break

            dst = EVAL_DIR / cls / f"{cls}_{i:04d}.jpg"
            try:
                with Image.open(src) as im:
                    # exif_transpose applies the orientation tag, then the re-save drops all
                    # EXIF -- the pixels stay correct but the metadata cannot be learned from.
                    im = ImageOps.exif_transpose(im).convert("RGB")
                    if args.square_crop:
                        side = min(im.size)
                        left = (im.width - side) // 2
                        top = (im.height - side) // 2
                        im = im.crop((left, top, left + side, top + side))
                    if args.normalize_long_side:
                        # Equalize resolution so file dimensions carry no class signal. The
                        # model resizes to 224 regardless, so the discarded detail is detail
                        # it never saw; what goes away is the camera fingerprint.
                        long_side = max(im.size)
                        if long_side != args.normalize_long_side:
                            ratio = args.normalize_long_side / long_side
                            im = im.resize(
                                (max(1, round(im.width * ratio)), max(1, round(im.height * ratio))),
                                Image.LANCZOS,
                            )
                    im.save(dst, "JPEG", quality=95)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! could not stage {src.name}: {exc}", file=sys.stderr)
                continue

            counts[cls] += 1
            rows.append([dst.relative_to(ML_ROOT).as_posix(), cls, src.name,
                         str(width), str(height), f"{std:.2f}", f"{h:064x}", md5])

    if overlaps:
        print(f"\n  !! {len(overlaps)} candidate(s) overlap the TRAINING corpus:", file=sys.stderr)
        for line in overlaps[:20]:
            print(f"     {line}", file=sys.stderr)
        if len(overlaps) > 20:
            print(f"     ... and {len(overlaps) - 20} more", file=sys.stderr)
        if not args.allow_overlap:
            shutil.rmtree(EVAL_DIR)
            print("\n  Aborted: a test set overlapping training data cannot measure "
                  "generalization. Remove the offending files, or pass --allow-overlap "
                  "if you are certain the matches are coincidental.", file=sys.stderr)
            sys.exit(1)

    manifest = EVAL_DIR / "manifest.csv"
    with manifest.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["path", "label", "source_filename", "width", "height", "std", "dhash", "md5"])
        w.writerows(rows)

    print("\n=== Eval set staged ===", file=sys.stderr)
    for cls in CLASSES:
        n = counts.get(cls, 0)
        note = "  <-- no real data for this class" if n == 0 else ""
        print(f"  {cls:<9} {n:>5}{note}", file=sys.stderr)
    print(f"\n  total: {sum(counts.values())}", file=sys.stderr)

    missing = [c for c in CLASSES if counts.get(c, 0) == 0]
    if missing:
        print(f"\n  NOTE: {missing} have no images, so per-class performance for them cannot "
              f"be measured on real data. A handful of photos would close this gap.",
              file=sys.stderr)
    thin = [c for c in CLASSES if 0 < counts.get(c, 0) < 30]
    if thin:
        print(f"  NOTE: {thin} have fewer than 30 images -- report confidence intervals, "
              f"not point estimates.", file=sys.stderr)

    print(f"\nWrote {manifest}", file=sys.stderr)


if __name__ == "__main__":
    main()
