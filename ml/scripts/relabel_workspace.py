"""
Build a drag-and-drop labeling workspace, then collect the results into a labels CSV.

The old image labels encoded *which dataset a file came from*, not how severe the damage was
(see ml/labeling_rubric.md). This script produces the workspace for re-labeling by severity.

Labeling UX: one representative image per near-duplicate ``group_id`` is copied into
``unlabeled/``, alongside empty ``low/ moderate/ high/ skip/ junk/`` folders. You sort the
images in File Explorer ("Extra large icons" + multi-select drag) and then run ``collect``.
Sorting files beats a numbered contact sheet because there is no index to mis-transcribe, and
it needs no extra tooling.

One row per group, never per file: near-duplicate copies inherit the group's label, which is
also what keeps augmented twins from being split across train/val.

Usage (from repo root, with the backend venv which has Pillow):
  # 1. build a workspace for the Roboflow pool (all groups)
  backend/.venv/Scripts/python.exe ml/scripts/relabel_workspace.py prepare --pool C

  # 2. sort images in ml/data/relabel/poolC/ in File Explorer, then:
  backend/.venv/Scripts/python.exe ml/scripts/relabel_workspace.py collect --pool C

  # 3. a stratified sample of the crack pool
  backend/.venv/Scripts/python.exe ml/scripts/relabel_workspace.py prepare --pool B --limit 600

  # 4. merge every collected pool into one labels file
  backend/.venv/Scripts/python.exe ml/scripts/relabel_workspace.py merge

Reads:  ml/data/image_groups.csv   (from scripts/dedupe_images.py)
Writes: ml/data/relabel/pool<X>/   (workspace)
        ml/data/labels_pool<X>.csv (per-pool results)
        ml/data/image_labels.csv   (merged, consumed by prepare_image_dataset.py)
"""

from __future__ import annotations

import argparse
import csv
import random
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

ML_ROOT = Path(__file__).resolve().parent.parent
GROUPS_CSV = ML_ROOT / "data" / "image_groups.csv"
RELABEL_ROOT = ML_ROOT / "data" / "relabel"
MERGED_CSV = ML_ROOT / "data" / "image_labels.csv"

# "skip" = cannot judge from the photo; "junk" = not a building at all. Both are recorded and
# excluded from training rather than silently dropped.
LABEL_DIRS = ["low", "moderate", "high", "skip", "junk"]

# Pool C is entirely structural-damage photography (the only true junk -- four UI screenshots --
# was quarantined before the workspace was built). Offering a "junk" bin there invited it to be
# used as a dumping ground for "hard to judge", which is what drove inter-rater agreement to
# near zero in the first labeling round.
LABEL_DIRS_NO_JUNK = ["low", "moderate", "high", "skip"]

# Worked examples, each verified by eye against the rubric. Filenames carry the reason, because
# a class name alone does not teach the boundary -- "cover gone AND rebar showing" does.
REFERENCE_EXAMPLES: list[tuple[str, str]] = [
    ("data/images/train/high/image1033_jpg.rf.ad8ac1bba89237f1b4278b0b3851c8b9.jpg",
     "HIGH_1__crushed-column-REBAR-EXPOSED-and-buckled"),
    ("data/images/train/high/image1035_jpg.rf.d9ed93af9c3f55043d37d88c196f9f45.jpg",
     "HIGH_2__column-cover-blown-off-REBAR-VISIBLE"),
    ("data/images/train/high/image120_jpg.rf.50ffd14c5523d52990fba8065ef30a98.jpg",
     "HIGH_3__cover-gone-corroded-REBAR-EXPOSED"),
    ("data/images/train/high/image854_jpg.rf.583996353221f8c1053511aa1b19ebe1.jpg",
     "HIGH_4__wide-cracks-with-spalling-even-without-visible-rebar"),
    ("data/images/train/high/image294_jpg.rf.5cfbe044054f37ff75ce86e24d8a415d.jpg",
     "MODERATE_1__multiple-X-pattern-hairline-cracks"),
    ("data/images/train/high/image151_jpg.rf.f901b3145fe500e9fc329dd91da9246f.jpg",
     "LOW_1__single-isolated-faint-hairline-crack"),
    ("data/images/train/low/16035.jpg",
     "LOW_2__sound-surface-no-cracking"),
]

# Pool A/B images are 227x227, which renders too small to judge in Explorer's icon view.
VIEW_MIN_PX = 512


def read_groups(pool: str | None) -> list[dict[str, str]]:
    if not GROUPS_CSV.exists():
        print(f"Missing {GROUPS_CSV}. Run scripts/dedupe_images.py first.", file=sys.stderr)
        sys.exit(1)
    with GROUPS_CSV.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if pool:
        rows = [r for r in rows if r["pool"] == pool]
    if not rows:
        print(f"No rows for pool {pool!r} in {GROUPS_CSV}.", file=sys.stderr)
        sys.exit(1)
    return rows


def pick_representatives(rows: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    """One image per group -- the sharpest (highest std-dev) member, as it is easiest to judge."""
    best: dict[str, dict[str, str]] = {}
    for r in rows:
        gid = r["group_id"]
        if gid not in best or float(r["std"]) > float(best[gid]["std"]):
            best[gid] = r
    return best


def cmd_prepare(args: argparse.Namespace) -> None:
    rows = read_groups(args.pool)
    reps = pick_representatives(rows)
    gids = sorted(reps, key=lambda g: int(g))

    if args.limit and args.limit < len(gids):
        rng = random.Random(args.seed)
        gids = sorted(rng.sample(gids, args.limit), key=lambda g: int(g))
        print(f"Sampled {len(gids):,} of {len(reps):,} groups (seed={args.seed}).", file=sys.stderr)

    workspace = RELABEL_ROOT / f"pool{args.pool}"
    unlabeled = workspace / "unlabeled"
    if workspace.exists() and not args.force:
        already = sum(len(list((workspace / d).glob("*.jpg"))) for d in LABEL_DIRS)
        if already:
            print(f"{workspace} already has {already} sorted image(s). "
                  f"Re-running would discard that work -- pass --force to overwrite.",
                  file=sys.stderr)
            sys.exit(1)
        reset_dir(workspace)
    elif workspace.exists():
        reset_dir(workspace)

    label_dirs = LABEL_DIRS_NO_JUNK if args.no_junk else LABEL_DIRS
    unlabeled.mkdir(parents=True)
    for d in label_dirs:
        (workspace / d).mkdir()

    copied = 0
    for gid in gids:
        r = reps[gid]
        src = ML_ROOT / r["path"]
        if not src.exists():
            print(f"  ! missing source: {src}", file=sys.stderr)
            continue
        flag = "_faint" if r.get("low_texture") == "1" else ""
        dst = unlabeled / f"g{int(gid):06d}__was-{r['src_class']}{flag}.jpg"
        try:
            with Image.open(src) as im:
                im = im.convert("RGB")
                if max(im.size) < VIEW_MIN_PX:
                    scale = VIEW_MIN_PX / max(im.size)
                    im = im.resize(
                        (round(im.width * scale), round(im.height * scale)), Image.LANCZOS
                    )
                im.save(dst, "JPEG", quality=92)
            copied += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  ! could not copy {src.name}: {exc}", file=sys.stderr)

    n_ref = build_reference_pack(workspace / "_examples")
    readme = WORKER_README.format(
        worker=f"pool {args.pool}",
        junk_line=("" if args.no_junk else
                   "  junk      Not a building at all (screenshot, document, random object).\n"),
    )
    if args.pool == "B":
        readme += POOL_B_NOTE
    (workspace / "README.txt").write_text(readme, encoding="utf-8")

    n_groups = len({r["group_id"] for r in rows})
    print(f"\nWorkspace ready: {workspace}", file=sys.stderr)
    print(f"  {copied:,} representative image(s) in unlabeled/ "
          f"(covering {len(rows):,} files in {n_groups:,} groups)", file=sys.stderr)
    print(f"  Sort them into: {', '.join(label_dirs)}", file=sys.stderr)
    print(f"  {n_ref} worked example(s) in _examples/ -- read those first.", file=sys.stderr)
    print("  Rubric: ml/labeling_rubric.md", file=sys.stderr)
    print(f"\n  Then: relabel_workspace.py collect --pool {args.pool}", file=sys.stderr)


def cmd_collect(args: argparse.Namespace) -> None:
    workspace = RELABEL_ROOT / f"pool{args.pool}"
    if not workspace.is_dir():
        print(f"No workspace at {workspace}. Run `prepare --pool {args.pool}` first.",
              file=sys.stderr)
        sys.exit(1)

    rows = read_groups(args.pool)
    by_group: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in rows:
        by_group[r["group_id"]].append(r)

    # A group can legitimately appear as several files (' - Copy', ' (1)') when sorting in
    # Explorer. Those are the same decision, not a conflict -- only a genuine disagreement
    # between two different folders needs the user's attention.
    assigned: dict[str, str] = {}
    seen_files: dict[str, set[str]] = defaultdict(set)
    conflicts: list[str] = []
    for label in LABEL_DIRS:
        for f in (workspace / label).glob("*.jpg"):
            gid = str(int(_canonical_name(f.name).split("__")[0].lstrip("g")))
            seen_files[gid].add(_canonical_name(f.name))
            prior = assigned.get(gid)
            if prior is None:
                assigned[gid] = label
            elif prior != label:
                conflicts.append(f"group {gid}: filed as both '{prior}' and '{label}'")

    if conflicts:
        print(f"{len(conflicts)} group(s) filed under two DIFFERENT labels -- resolve these:",
              file=sys.stderr)
        for c in conflicts[:20]:
            print(f"  {c}", file=sys.stderr)
        print("\n  Delete the copy in the wrong folder, then re-run.", file=sys.stderr)
        sys.exit(1)

    sorted_names = {n for names in seen_files.values() for n in names}
    remaining = len([
        f for f in (workspace / "unlabeled").glob("*.jpg")
        if _canonical_name(f.name) not in sorted_names
    ])
    out_csv = ML_ROOT / "data" / f"labels_pool{args.pool}.csv"
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["group_id", "pool", "label", "src_class", "n_files", "path"])
        for gid, label in sorted(assigned.items(), key=lambda kv: int(kv[0])):
            members = by_group.get(gid, [])
            for m in members:
                w.writerow([gid, args.pool, label, m["src_class"], len(members), m["path"]])

    counts = Counter(assigned.values())
    n_files = sum(len(by_group.get(g, [])) for g in assigned)
    print(f"\nCollected {len(assigned):,} labeled group(s) -> {n_files:,} files", file=sys.stderr)
    for label in LABEL_DIRS:
        print(f"  {label:<9} {counts.get(label, 0):>6,} groups", file=sys.stderr)
    if remaining:
        print(f"\n  {remaining:,} image(s) still in unlabeled/", file=sys.stderr)

    # The old labels are the thing being corrected, so show how far they moved.
    changed = 0
    for gid, label in assigned.items():
        if label in {"low", "moderate", "high"} and by_group[gid][0]["src_class"] != label:
            changed += 1
    if assigned:
        print(f"\n  {changed:,} group(s) changed class vs. the original source-based label.",
              file=sys.stderr)
    print(f"\nWrote {out_csv}", file=sys.stderr)


WORKER_README = """RAPID image labeling -- batch for {worker}
================================================

READ THIS FIRST: open the _examples/ folder next to this file. It has real
photos already labeled, with the reason in the filename. The first labeling
round failed because people applied the rules differently -- the examples are
what stop that happening again.

EVERY image in your batch IS a photo of building damage. There are no junk
images and no trick questions. Your ONLY job is to decide HOW BAD it is.

Sort every image in unlabeled/ into ONE of these folders:

  low       Sound surface, or ONE isolated thin hairline crack.
            Stains, dirt, moss, worn paint = still low.
            Nothing broken away, no steel showing.

  moderate  MULTIPLE cracks, or a PATTERN of cracks -- X-shaped, diagonal,
            or a map/grid network -- even if each crack is thin.
            Also clearly visible cracks about 1-5mm wide.
            Still nothing broken away and nothing out of position.

  high      Material has BROKEN AWAY: spalling, crushing, a missing chunk
            of plaster or concrete -- with or without steel showing.
            Also: exposed / bent / rusted reinforcing bars,
                  cracks wider than ~5mm,
                  anything leaning, shifted, separated or collapsed.

  skip      You genuinely cannot tell -- too blurry, or too zoomed in to judge.
            Use this ONLY when you truly cannot decide.
{junk_line}
THE ONE TEST THAT DECIDES MOST CASES:
    Has material broken away from the surface?
        no,  one isolated thin crack        ->  low
        no,  several cracks or a pattern    ->  moderate
        yes, anything broken off/spalled    ->  high

TWO RULES PEOPLE GET BACKWARDS -- check the _examples/ folder:
- Spalling with NO rebar visible is still HIGH (see HIGH_4). Losing material
  is the problem; whether the photo happens to show a bar is not.
- X-shaped or grid hairline cracking is MODERATE, not low (see MODERATE_1
  next to LOW_1). A pattern of fine cracks means distributed distress;
  one lone crack does not.

ALSO PLEASE AVOID:
- A close-up photo is NOT junk. Extreme close-ups of damage are exactly what
  this app captures. Judge the damage you can see.
- A rusty pipe, fence, or roof sheet is NOT reinforcing steel.
- Do not leave anything in unlabeled/. Every image gets a folder.

Notes
-----
- Judge only what is in the frame. Do not guess at damage you cannot see.
- If one photo shows several severities, label the WORST one visible.
- Filenames ending in _faint are low-contrast -- look closely before deciding.
- Do NOT rename files. The name carries the ID used to merge everyone's work.
- MOVE files, do not copy them (drag normally; do not hold Ctrl). If unlabeled/
  still has copies at the end, that is a copy instead of a move.
- Some images appear in more than one person's batch on purpose. That is the
  agreement check -- label them normally and do NOT discuss them with anyone.

When finished, unlabeled/ should be empty. Send the whole {worker}/ folder back.

Full rubric: ml/labeling_rubric.md
"""


POOL_B_NOTE = """

=================================================================
EXTRA NOTES FOR THIS BATCH (pool B -- close-up crack crops)
=================================================================

These are tight 227px crops of concrete surfaces. There is no ruler and no
building context, so do NOT try to measure millimetres. Judge RELATIVELY:

  low       ONE thin, faint, hairline crack. Barely there. Nothing else.
            Also: surface stains, dark patches, or texture that is not a crack.

  moderate  A crack that is clearly WIDE or DARK,
            OR two or more separate cracks,
            OR a crack that BRANCHES or forms a net/pattern.

  high      Rare here. Only if material has clearly broken away
            (a hole, a missing chunk, exposed aggregate or steel) --
            not merely a wide crack.

Do NOT mass-skip. "Too zoomed in" is normal for this batch -- these crops are
the whole point. Reserve `skip` for images where you genuinely cannot see
whether there is a crack at all.

WHY THIS BATCH MATTERS: right now every `low` image in training is a 227px crop
and every `moderate`/`high` image is a 640px photo, so the model can tell the
classes apart from image size alone without ever looking at the damage. Putting
227px crops into `moderate` too is what breaks that shortcut. The `moderate`
pile is the valuable one -- it is also the class the model currently gets most
wrong on real photos.

You can stop at any point and run `collect` -- partial work is kept.
"""


def reset_dir(path: Path) -> None:
    """Empty a directory, tolerating Windows locks.

    File Explorer holds a handle on whatever folder is open, so ``shutil.rmtree`` raises
    PermissionError mid-way and leaves the workspace half-deleted. Clearing the contents and
    reusing the directory works whether or not something is watching it.
    """
    if not path.exists():
        return
    for child in sorted(path.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        try:
            if child.is_file() or child.is_symlink():
                child.unlink()
            elif child.is_dir():
                child.rmdir()
        except OSError:
            pass  # locked entry; the caller overwrites in place
    try:
        path.rmdir()
    except OSError:
        pass


def build_reference_pack(dest: Path) -> int:
    """Copy the verified worked examples into ``dest``. Returns how many were written."""
    dest.mkdir(parents=True, exist_ok=True)
    written = 0
    for rel, name in REFERENCE_EXAMPLES:
        src = ML_ROOT / rel
        if not src.exists():
            print(f"  ! reference example missing: {rel}", file=sys.stderr)
            continue
        try:
            with Image.open(src) as im:
                im = im.convert("RGB")
                if max(im.size) < VIEW_MIN_PX:
                    scale = VIEW_MIN_PX / max(im.size)
                    im = im.resize((round(im.width * scale), round(im.height * scale)),
                                   Image.LANCZOS)
                im.save(dest / f"{name}.jpg", "JPEG", quality=92)
            written += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  ! could not copy reference {rel}: {exc}", file=sys.stderr)
    return written


def cmd_reference(args: argparse.Namespace) -> None:
    dest = RELABEL_ROOT / "reference"
    n = build_reference_pack(dest)
    print(f"Wrote {n} worked example(s) to {dest}", file=sys.stderr)
    print("  Look at these BEFORE labeling, and keep them open while you work.", file=sys.stderr)


def cmd_split(args: argparse.Namespace) -> None:
    """Partition a prepared workspace into per-person batches with a shared calibration set.

    Every labeler sees the same `--calibration` images. That overlap is what makes it possible
    to measure whether the three of you are applying the rubric the same way -- without it,
    three people's labels are three different definitions of "moderate" silently mixed into one
    training set.
    """
    src = RELABEL_ROOT / f"pool{args.pool}" / "unlabeled"
    if not src.is_dir():
        print(f"No prepared workspace at {src}. Run `prepare --pool {args.pool}` first.",
              file=sys.stderr)
        sys.exit(1)

    images = sorted(src.glob("*.jpg"))
    if not images:
        print(f"No images in {src} -- has this pool already been sorted?", file=sys.stderr)
        sys.exit(1)

    if args.calibration >= len(images):
        print(f"--calibration ({args.calibration}) must be smaller than the pool "
              f"({len(images)} images).", file=sys.stderr)
        sys.exit(1)

    rng = random.Random(args.seed)
    shuffled = images[:]
    rng.shuffle(shuffled)
    calibration = shuffled[:args.calibration]
    rest = shuffled[args.calibration:]

    out_root = RELABEL_ROOT / f"pool{args.pool}_split"
    if out_root.exists():
        if not args.force:
            print(f"{out_root} already exists. Pass --force to rebuild.", file=sys.stderr)
            sys.exit(1)
        reset_dir(out_root)

    label_dirs = LABEL_DIRS_NO_JUNK if args.no_junk else LABEL_DIRS

    per_worker: dict[str, list[Path]] = {}
    for i in range(args.workers):
        name = f"worker{i + 1}"
        per_worker[name] = list(calibration) + rest[i::args.workers]

    n_ref = 0
    for name, files in per_worker.items():
        wdir = out_root / name
        (wdir / "unlabeled").mkdir(parents=True)
        for d in label_dirs:
            (wdir / d).mkdir()
        for f in files:
            shutil.copy2(f, wdir / "unlabeled" / f.name)
        (wdir / "README.txt").write_text(
            WORKER_README.format(
                worker=name,
                junk_line=("" if args.no_junk else
                           "  junk      Not a building at all (screenshot, document, random object).\n"),
            ),
            encoding="utf-8",
        )
        n_ref = build_reference_pack(wdir / "_examples")
    if n_ref:
        print(f"  {n_ref} worked example(s) placed in each _examples/ folder", file=sys.stderr)

    print(f"\nSplit pool {args.pool} across {args.workers} labeler(s): {out_root}", file=sys.stderr)
    print(f"  {len(images):,} images -> {args.calibration} shared (everyone labels these) "
          f"+ {len(rest):,} divided", file=sys.stderr)
    for name, files in per_worker.items():
        print(f"    {name}: {len(files):,} images", file=sys.stderr)
    print(f"\n  Hand out one folder each (Google Drive is fine -- see README.txt inside).",
          file=sys.stderr)
    print(f"  When all are returned, put them back under {out_root} and run:", file=sys.stderr)
    print(f"    relabel_workspace.py collect-team --pool {args.pool}", file=sys.stderr)


# Windows and Google Drive tack on both ' (1)' and ' - Copy' when a file is duplicated, and
# they stack: 'name - Copy - Copy (2)'. Strip any run of them from the end.
_COPY_SUFFIX_RE = re.compile(r"(?:\s*\(\d+\)|\s*-\s*Copy)+$", re.IGNORECASE)


def _canonical_name(filename: str) -> str:
    """Reduce a duplicated filename back to the original the workspace handed out.

    Without this, 'g000040__was-high.jpg', 'g000040__was-high (1).jpg' and
    'g000040__was-high - Copy.jpg' count as three separate votes for one image.
    """
    stem, dot, ext = filename.rpartition(".")
    if not dot:
        return filename
    return f"{_COPY_SUFFIX_RE.sub('', stem)}.{ext}"


def _fleiss_kappa(ratings: list[list[int]]) -> float | None:
    """Fleiss' kappa over items x category-counts. None if undefined (e.g. total agreement)."""
    n_items = len(ratings)
    if not n_items:
        return None
    n_raters = sum(ratings[0])
    if n_raters < 2 or any(sum(r) != n_raters for r in ratings):
        return None

    p_i = [
        (sum(c * c for c in row) - n_raters) / (n_raters * (n_raters - 1))
        for row in ratings
    ]
    p_bar = sum(p_i) / n_items
    n_cats = len(ratings[0])
    p_j = [sum(row[j] for row in ratings) / (n_items * n_raters) for j in range(n_cats)]
    p_e = sum(p * p for p in p_j)
    if abs(1 - p_e) < 1e-12:
        return None
    return (p_bar - p_e) / (1 - p_e)


def _kappa_verdict(k: float) -> str:
    if k < 0.20:
        return "slight -- the rubric is not being applied consistently"
    if k < 0.40:
        return "fair -- expect noticeable label noise"
    if k < 0.60:
        return "moderate -- usable, but reconcile the disagreements"
    if k < 0.80:
        return "substantial -- good"
    return "almost perfect"


def cmd_collect_team(args: argparse.Namespace) -> None:
    out_root = RELABEL_ROOT / f"pool{args.pool}_split"
    if not out_root.is_dir():
        print(f"No split workspace at {out_root}. Run `split --pool {args.pool}` first.",
              file=sys.stderr)
        sys.exit(1)

    workers = sorted(d for d in out_root.iterdir() if d.is_dir() and d.name.startswith("worker"))
    if not workers:
        print(f"No worker* folders under {out_root}.", file=sys.stderr)
        sys.exit(1)

    # image name -> {worker: label}
    votes: dict[str, dict[str, str]] = defaultdict(dict)
    unlabeled_left: dict[str, int] = {}
    conflicts: list[str] = []
    for w in workers:
        sorted_names: set[str] = set()
        for label in LABEL_DIRS:
            for f in (w / label).glob("*.jpg"):
                name = _canonical_name(f.name)
                sorted_names.add(name)
                prior = votes[name].get(w.name)
                if prior and prior != label:
                    conflicts.append(f"{w.name}: {name} in both {prior}/ and {label}/")
                votes[name][w.name] = label
        # Copying instead of moving (a common Drive/Explorer slip) leaves the original in
        # unlabeled/. Those are not outstanding work, so don't count them as such.
        left = [
            f for f in (w / "unlabeled").glob("*.jpg")
            if _canonical_name(f.name) not in sorted_names
        ]
        unlabeled_left[w.name] = len(left)

    if conflicts:
        print("Same image filed under two labels by one person -- resolve these:", file=sys.stderr)
        for c in conflicts[:20]:
            print(f"  {c}", file=sys.stderr)
        sys.exit(1)

    if not votes:
        print("No labeled images found yet.", file=sys.stderr)
        sys.exit(1)

    shared = {name: v for name, v in votes.items() if len(v) > 1}
    single = {name: v for name, v in votes.items() if len(v) == 1}

    print(f"Labelers: {', '.join(w.name for w in workers)}", file=sys.stderr)
    print(f"  labeled images : {len(votes):,}", file=sys.stderr)
    print(f"  shared (agreement set): {len(shared):,}", file=sys.stderr)
    for wname, n in unlabeled_left.items():
        if n:
            print(f"  ! {wname} still has {n:,} unlabeled", file=sys.stderr)

    # --- Agreement on the shared set ---
    disagreements: list[tuple[str, dict[str, str]]] = []
    fully_rated = [v for v in shared.values() if len(v) == len(workers)]
    if fully_rated:
        cats = LABEL_DIRS
        matrix = [[sum(1 for lab in v.values() if lab == c) for c in cats] for v in fully_rated]
        exact = sum(1 for row in matrix if max(row) == len(workers))
        pct = exact / len(fully_rated)
        kappa = _fleiss_kappa(matrix)

        print(f"\n=== Inter-rater agreement ({len(fully_rated)} shared images) ===", file=sys.stderr)
        print(f"  unanimous      : {exact}/{len(fully_rated)}  ({pct:.0%})", file=sys.stderr)
        if kappa is None:
            print("  Fleiss' kappa  : undefined (all raters chose one category)", file=sys.stderr)
        else:
            print(f"  Fleiss' kappa  : {kappa:.3f}  -- {_kappa_verdict(kappa)}", file=sys.stderr)
            print("  (Report this in the manuscript; it is the standard measure of "
                  "labeling reliability.)", file=sys.stderr)

    for name, v in shared.items():
        if len(set(v.values())) > 1:
            disagreements.append((name, v))

    # --- Resolve: majority where possible, otherwise flag for adjudication ---
    resolved: dict[str, str] = {}
    needs_call: list[tuple[str, dict[str, str]]] = []
    for name, v in votes.items():
        tally = Counter(v.values())
        top, top_n = tally.most_common(1)[0]
        if top_n * 2 > len(v):  # strict majority
            resolved[name] = top
        else:
            needs_call.append((name, v))

    if needs_call:
        adj = out_root / "_adjudicate"
        if adj.exists():
            shutil.rmtree(adj)
        adj.mkdir()
        for name, v in needs_call:
            for w in workers:
                if w.name in v:
                    srcf = w / v[w.name] / name
                    if srcf.exists():
                        shutil.copy2(srcf, adj / name)
                        break
        print(f"\n  {len(needs_call)} image(s) have no majority -- copied to {adj}", file=sys.stderr)
        print("  Decide these together, then move each into the right folder in worker1/.",
              file=sys.stderr)
        for name, v in needs_call[:10]:
            print(f"     {name}: {v}", file=sys.stderr)

    # --- Write per-pool labels, expanded back over every file in each group ---
    rows_src = read_groups(args.pool)
    by_group: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in rows_src:
        by_group[r["group_id"]].append(r)

    out_csv = ML_ROOT / "data" / f"labels_pool{args.pool}.csv"
    written = 0
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["group_id", "pool", "label", "src_class", "n_files", "path"])
        for name, label in sorted(resolved.items()):
            gid = str(int(name.split("__")[0].lstrip("g")))
            members = by_group.get(gid, [])
            for m in members:
                w.writerow([gid, args.pool, label, m["src_class"], len(members), m["path"]])
                written += 1

    counts = Counter(resolved.values())
    print(f"\n=== Collected ===", file=sys.stderr)
    for label in LABEL_DIRS:
        print(f"  {label:<9} {counts.get(label, 0):>6,} groups", file=sys.stderr)
    print(f"\n  {len(resolved):,} groups -> {written:,} files", file=sys.stderr)
    print(f"  {len(disagreements):,} disagreement(s) on the shared set "
          f"(majority applied where one existed)", file=sys.stderr)
    print(f"\nWrote {out_csv}", file=sys.stderr)


def cmd_autolabel(args: argparse.Namespace) -> None:
    """Label a whole pool from its source dataset's definition, without hand-sorting.

    Only defensible when the source dataset *defines* the class. Pool A is the "Negative"
    half of the Mendeley Concrete Crack set -- images selected by its authors for containing
    no crack -- so calling them `low` restates the source definition rather than guessing.
    The reason is written into the CSV so the provenance is auditable later.
    """
    rows = read_groups(args.pool)
    by_group: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in rows:
        by_group[r["group_id"]].append(r)

    gids = sorted(by_group, key=lambda g: int(g))
    if args.limit and args.limit < len(gids):
        rng = random.Random(args.seed)
        gids = sorted(rng.sample(gids, args.limit), key=lambda g: int(g))

    out_csv = ML_ROOT / "data" / f"labels_pool{args.pool}.csv"
    written = 0
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["group_id", "pool", "label", "src_class", "n_files", "path", "provenance"])
        for gid in gids:
            members = by_group[gid]
            for m in members:
                w.writerow([gid, args.pool, args.label, m["src_class"], len(members),
                            m["path"], f"auto:{args.reason}"])
                written += 1

    print(f"Auto-labeled {len(gids):,} group(s) / {written:,} file(s) in pool {args.pool} "
          f"as '{args.label}'", file=sys.stderr)
    print(f"  provenance recorded: {args.reason}", file=sys.stderr)
    print(f"\nWrote {out_csv}", file=sys.stderr)


def cmd_merge(args: argparse.Namespace) -> None:
    parts = sorted((ML_ROOT / "data").glob("labels_pool*.csv"))
    if not parts:
        print("No labels_pool*.csv files found. Run `collect` for at least one pool.",
              file=sys.stderr)
        sys.exit(1)

    seen: set[str] = set()
    merged: list[list[str]] = []
    for p in parts:
        with p.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                key = row["path"]
                if key in seen:
                    continue
                seen.add(key)
                merged.append([row["group_id"], row["pool"], row["label"],
                               row["src_class"], row["path"]])

    with MERGED_CSV.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["group_id", "pool", "label", "src_class", "path"])
        w.writerows(merged)

    counts = Counter(r[2] for r in merged)
    pools = Counter(r[1] for r in merged)
    trainable = sum(counts.get(c, 0) for c in ("low", "moderate", "high"))
    print(f"Merged {len(parts)} pool file(s) -> {len(merged):,} labeled files", file=sys.stderr)
    print(f"  by label: {dict(counts)}", file=sys.stderr)
    print(f"  by pool : {dict(pools)}", file=sys.stderr)
    print(f"  trainable (low/moderate/high): {trainable:,}", file=sys.stderr)

    # Any class drawn from a single pool can still be identified by resolution alone -- the
    # exact shortcut that produced the 0.9975 validation score. Surface it now, not after training.
    per_class_pools: dict[str, set[str]] = defaultdict(set)
    for r in merged:
        if r[2] in ("low", "moderate", "high"):
            per_class_pools[r[2]].add(r[1])
    single = [c for c, ps in per_class_pools.items() if len(ps) == 1]
    if single:
        print(f"\n  WARNING: class(es) {single} come from a single source pool. Resolution/blur "
              f"can still act as a shortcut -- rebalance or document as a confound.",
              file=sys.stderr)

    print(f"\nWrote {MERGED_CSV}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Severity re-labeling workspace.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_prep = sub.add_parser("prepare", help="Create a drag-and-drop workspace for a pool.")
    p_prep.add_argument("--pool", required=True, choices=["A", "B", "C"])
    p_prep.add_argument("--limit", type=int, default=None,
                        help="Sample this many groups instead of all (for the 20k pools).")
    p_prep.add_argument("--seed", type=int, default=42)
    p_prep.add_argument("--force", action="store_true",
                        help="Overwrite a workspace that already contains sorted images.")
    p_prep.add_argument("--no-junk", action="store_true",
                        help="Omit the junk/ bin for pools that are entirely damage photography.")
    p_prep.set_defaults(func=cmd_prepare)

    p_coll = sub.add_parser("collect", help="Read sorted folders into labels_pool<X>.csv.")
    p_coll.add_argument("--pool", required=True, choices=["A", "B", "C"])
    p_coll.set_defaults(func=cmd_collect)

    p_split = sub.add_parser("split", help="Divide a pool into per-person batches.")
    p_split.add_argument("--pool", required=True, choices=["A", "B", "C"])
    p_split.add_argument("--workers", type=int, default=3, help="Number of labelers (default 3).")
    p_split.add_argument("--calibration", type=int, default=90,
                         help="Images every labeler receives, used to measure agreement "
                              "(default 90).")
    p_split.add_argument("--seed", type=int, default=42)
    p_split.add_argument("--force", action="store_true")
    p_split.add_argument("--no-junk", action="store_true",
                         help="Omit the junk/ bin. Use for pools that are entirely damage "
                              "photography (e.g. pool C), where junk has no legitimate use and "
                              "becomes a dumping ground for 'hard to judge'.")
    p_split.set_defaults(func=cmd_split)

    p_ref = sub.add_parser("reference", help="Build the worked-example pack on its own.")
    p_ref.set_defaults(func=cmd_reference)

    p_auto = sub.add_parser("autolabel",
                            help="Label a pool from its source-dataset definition (no sorting).")
    p_auto.add_argument("--pool", required=True, choices=["A", "B", "C"])
    p_auto.add_argument("--label", required=True, choices=["low", "moderate", "high"])
    p_auto.add_argument("--limit", type=int, default=None, help="Sample this many groups.")
    p_auto.add_argument("--seed", type=int, default=42)
    p_auto.add_argument("--reason", required=True,
                        help="Why the source dataset justifies this label; stored in the CSV.")
    p_auto.set_defaults(func=cmd_autolabel)

    p_team = sub.add_parser("collect-team",
                            help="Merge per-person batches, report agreement, resolve by majority.")
    p_team.add_argument("--pool", required=True, choices=["A", "B", "C"])
    p_team.set_defaults(func=cmd_collect_team)

    p_merge = sub.add_parser("merge", help="Merge every labels_pool*.csv into image_labels.csv.")
    p_merge.set_defaults(func=cmd_merge)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
