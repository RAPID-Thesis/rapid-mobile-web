"""
Detect exact and near-duplicate images across the raw corpus and assign group IDs.

Why this exists: Roboflow exports commonly ship 2-3 augmented copies of the same source
photo. A random train/val split then puts augmented twins on both sides, which inflates
validation scores without the model generalizing at all. Splitting by ``group_id`` instead
of by file keeps every copy of a photo on one side of the split.

Also reports **cross-class duplicates** -- the same image filed under two different labels,
which is a direct labeling contradiction and must be resolved before training.

Method: 64-bit dHash (difference hash) per image, then union-find clustering over pairs
within a Hamming radius. Candidate pairs are found by multi-index hashing (the hash is cut
into 8 one-byte segments; two hashes within distance <= 7 must share at least one segment),
so this stays fast on ~40k images instead of doing 800M pairwise comparisons.

No new dependencies -- Pillow only.

Usage (from repo root, with the backend venv which has Pillow):
  backend/.venv/Scripts/python.exe ml/scripts/dedupe_images.py
  backend/.venv/Scripts/python.exe ml/scripts/dedupe_images.py --threshold 3

Reads:  ml/data/images/train/{low,moderate,high}/*
Writes: ml/data/image_groups.csv  (path, src_class, pool, width, height, dhash, group_id)
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

try:  # iPhone photos arrive as HEIC, which Pillow cannot decode on its own.
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:  # pragma: no cover - only needed when HEIC files are present
    pass

ML_ROOT = Path(__file__).resolve().parent.parent

# Source pool per raw class directory. Pools matter because the original dataset drew each
# class from a different source at a different resolution, which let the model separate
# classes by image statistics rather than by damage severity.
POOL_BY_CLASS = {
    "low": "A",       # Mendeley Concrete Crack "Negative", 227x227
    "moderate": "B",  # Mendeley Concrete Crack "Positive", 227x227
    "high": "C",      # Roboflow export, 640x640
}

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".heic", ".heif"}
HASH_SIZE = 16   # 16x17 grayscale -> 256-bit hash
SEGMENTS = 32    # byte-sized multi-index segments over a 256-bit hash

# Images whose downsampled grayscale std-dev falls below this are effectively flat at hash
# resolution: a faint hairline crack on a pale wall washes out completely and every such
# image collapses to an all-zero (or all-one) hash. Clustering them would merge unrelated
# photos, so they are kept as singletons and flagged for manual review instead.
LOW_TEXTURE_STD = 6.0


def dhash(path: Path) -> tuple[int, float, int, int] | None:
    """256-bit difference hash, downsampled std-dev, and the original (width, height).

    Size is captured here rather than in a second pass so each file is opened once.
    Returns None if the file can't be decoded.
    """
    try:
        with Image.open(path) as im:
            width, height = im.size
            # draft() lets libjpeg decode at reduced scale -- large speedup on big JPEGs.
            im.draft("L", (HASH_SIZE * 4, HASH_SIZE * 4))
            im = im.convert("L").resize((HASH_SIZE + 1, HASH_SIZE), Image.BILINEAR)
            px = im.tobytes()  # row-major, 1 byte per pixel in mode "L"
    except Exception as exc:  # noqa: BLE001 - want to skip and report, not abort the run
        print(f"  ! unreadable: {path.name} ({exc})", file=sys.stderr)
        return None

    n = len(px)
    mean = sum(px) / n
    std = (sum((p - mean) ** 2 for p in px) / n) ** 0.5

    bits = 0
    for row in range(HASH_SIZE):
        base = row * (HASH_SIZE + 1)
        for col in range(HASH_SIZE):
            bits = (bits << 1) | int(px[base + col] > px[base + col + 1])
    return bits, std, width, height


class UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, a: int) -> int:
        while self.parent[a] != a:
            self.parent[a] = self.parent[self.parent[a]]
            a = self.parent[a]
        return a

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def collect_images(raw_dir: Path) -> list[tuple[Path, str]]:
    out: list[tuple[Path, str]] = []
    for cls_dir in sorted(p for p in raw_dir.iterdir() if p.is_dir()):
        cls = cls_dir.name
        if cls not in POOL_BY_CLASS:
            print(f"Skipping unrecognized class dir: {cls}", file=sys.stderr)
            continue
        for f in sorted(cls_dir.iterdir()):
            if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES:
                out.append((f, cls))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Group near-duplicate images (leakage-safe splitting).")
    parser.add_argument("--raw-dir", type=Path, default=ML_ROOT / "data" / "images" / "train")
    parser.add_argument("--out-csv", type=Path, default=ML_ROOT / "data" / "image_groups.csv")
    parser.add_argument("--threshold", type=int, default=12,
                        help="Max Hamming distance (of 256 bits) treated as a near-duplicate "
                             "(default 12, max 31)")
    parser.add_argument("--low-texture-std", type=float, default=LOW_TEXTURE_STD,
                        help=f"Downsampled std-dev below which an image is excluded from "
                             f"clustering (default {LOW_TEXTURE_STD})")
    parser.add_argument("--max-bucket", type=int, default=3000,
                        help="Skip pairwise comparison in candidate buckets larger than this (default 3000)")
    args = parser.parse_args()

    if args.threshold > SEGMENTS - 1:
        print(f"--threshold above {SEGMENTS - 1} breaks the multi-index recall guarantee.",
              file=sys.stderr)
        sys.exit(1)

    files = collect_images(args.raw_dir)
    if not files:
        print(f"No images found under {args.raw_dir}", file=sys.stderr)
        sys.exit(1)
    print(f"Hashing {len(files):,} images from {args.raw_dir} ...", file=sys.stderr)

    hashes: list[int] = []
    stds: list[float] = []
    dims: list[tuple[int, int]] = []
    kept: list[tuple[Path, str]] = []
    for i, (path, cls) in enumerate(files):
        if i and i % 5000 == 0:
            print(f"  {i:,}/{len(files):,}", file=sys.stderr)
        result = dhash(path)
        if result is None:
            continue
        h, std, width, height = result
        hashes.append(h)
        stds.append(std)
        dims.append((width, height))
        kept.append((path, cls))

    low_texture = [s < args.low_texture_std for s in stds]
    n_low = sum(low_texture)
    if n_low:
        print(f"  {n_low:,} image(s) below the low-texture threshold "
              f"(std < {args.low_texture_std}) -- excluded from clustering.", file=sys.stderr)

    print(f"Hashed {len(kept):,} images. Clustering (threshold={args.threshold}) ...", file=sys.stderr)

    uf = UnionFind(len(hashes))

    # Pass 1 -- exact hash equality, O(n). Catches straight duplicates and most re-encodes.
    # Low-texture images are skipped: they share degenerate all-zero/all-one hashes without
    # being the same photo.
    exact: dict[int, int] = {}
    for idx, h in enumerate(hashes):
        if low_texture[idx]:
            continue
        if h in exact:
            uf.union(exact[h], idx)
        else:
            exact[h] = idx

    # Pass 2 -- near-duplicates via multi-index hashing. Two hashes within Hamming distance
    # <= 7 must agree on at least one of the 8 byte-segments (pigeonhole), so only images
    # sharing a segment are ever compared.
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for idx, h in enumerate(hashes):
        if low_texture[idx]:
            continue
        for seg in range(SEGMENTS):
            buckets[(seg, (h >> (seg * 8)) & 0xFF)].append(idx)

    # Low-texture images (flat concrete) produce near-identical hashes and can pile tens of
    # thousands of entries into one bucket, making the pairwise step quadratic. Those buckets
    # carry no useful duplicate signal anyway -- exact matches were already handled in pass 1.
    oversized = 0
    compared: set[tuple[int, int]] = set()
    for members in buckets.values():
        if len(members) < 2:
            continue
        if len(members) > args.max_bucket:
            oversized += 1
            continue
        for a_pos, a in enumerate(members):
            for b in members[a_pos + 1:]:
                pair = (a, b) if a < b else (b, a)
                if pair in compared:
                    continue
                compared.add(pair)
                if (hashes[a] ^ hashes[b]).bit_count() <= args.threshold:
                    uf.union(a, b)

    if oversized:
        print(f"  note: skipped {oversized:,} oversized bucket(s) (> {args.max_bucket:,} entries); "
              f"exact duplicates in them were still grouped in pass 1.", file=sys.stderr)

    groups: dict[int, int] = {}
    group_members: dict[int, list[int]] = defaultdict(list)
    for idx in range(len(hashes)):
        root = uf.find(idx)
        if root not in groups:
            groups[root] = len(groups)
        group_members[groups[root]].append(idx)

    # --- Write manifest ---
    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["path", "src_class", "pool", "width", "height", "std", "low_texture",
                    "dhash", "group_id"])
        for idx, (path, cls) in enumerate(kept):
            width, height = dims[idx]
            try:
                rel = path.relative_to(ML_ROOT).as_posix()
            except ValueError:
                rel = path.as_posix()  # raw-dir outside ml/ (e.g. a smoke-test directory)
            w.writerow([
                rel, cls, POOL_BY_CLASS[cls], width, height,
                f"{stds[idx]:.2f}", int(low_texture[idx]),
                f"{hashes[idx]:064x}", groups[uf.find(idx)],
            ])

    # --- Report ---
    per_class: dict[str, int] = defaultdict(int)
    for _, cls in kept:
        per_class[cls] += 1

    sizes = [len(m) for m in group_members.values()]
    dup_groups = [m for m in group_members.values() if len(m) > 1]
    n_redundant = sum(len(m) - 1 for m in dup_groups)

    print("\n=== Duplicate report ===", file=sys.stderr)
    for cls, n in sorted(per_class.items()):
        print(f"  {cls:<9} {n:>7,} images  (pool {POOL_BY_CLASS[cls]})", file=sys.stderr)
    print(f"\n  unique groups      : {len(group_members):,}", file=sys.stderr)
    print(f"  multi-image groups : {len(dup_groups):,}", file=sys.stderr)
    print(f"  redundant copies   : {n_redundant:,}", file=sys.stderr)
    print(f"  largest group      : {max(sizes) if sizes else 0}", file=sys.stderr)
    print(f"  low-texture (flagged, unclustered): {n_low:,}", file=sys.stderr)

    # Cross-class duplicates are a labeling contradiction, not just redundancy.
    cross: list[tuple[int, set[str]]] = []
    for gid, members in group_members.items():
        classes = {kept[m][1] for m in members}
        if len(classes) > 1:
            cross.append((gid, classes))
    if cross:
        print(f"\n  !! {len(cross)} group(s) span MULTIPLE classes -- same image, conflicting labels:",
              file=sys.stderr)
        for gid, classes in cross[:15]:
            example = kept[group_members[gid][0]][0].name
            print(f"     group {gid}: {sorted(classes)}  e.g. {example}", file=sys.stderr)
        if len(cross) > 15:
            print(f"     ... and {len(cross) - 15} more", file=sys.stderr)
    else:
        print("\n  No cross-class duplicates found.", file=sys.stderr)

    print(f"\nWrote {args.out_csv}", file=sys.stderr)


if __name__ == "__main__":
    main()
