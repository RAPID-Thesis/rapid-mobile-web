#!/usr/bin/env python3
"""
Measure the image-validity gate, and set its thresholds from the measurement.

  python ml/scripts/eval_image_gate.py
  python ml/scripts/eval_image_gate.py --write-thresholds
  python ml/scripts/eval_image_gate.py --probe path/to/photos

Requires ml/artifacts/mobile/image_gate.tflite (export_image_gate_model.py).

What this measures, and what it cannot
--------------------------------------
Positives are the 1,602 photos in ml/data/image_labels.csv labelled low /
moderate / high -- all genuine assessment photos, every one of which the gate
must let through. The number that matters is therefore the FALSE BLOCK RATE: a
gate that stops real work in the field is worse than no gate at all.

Negatives are the 72 rows labelled `junk` ("not a building at all: screenshot,
document, random object") plus ml/data/images/_quarantine/. That set is real but
narrow: it is screenshots and indoor scenes from one labelling pool. It contains
no photographs of people, food, pets or vehicles -- which are exactly the cases
the blocking buckets target.

So this script can prove the gate is SAFE (it does not block genuine work) and
can only partly show that it is EFFECTIVE. Recall against a camera pointed at a
person is not established by anything here, and must not be claimed from it.

To close that gap, take about thirty deliberate photos -- people, interiors,
vehicles, meals, paperwork -- into a folder and run:

    python ml/scripts/eval_image_gate.py --probe that/folder

which prints the verdict and bucket masses per image. That is the check worth
doing before a defence.

Why a building detector is not used
-----------------------------------
It was tried first. The image branch trains on close-ups of concrete surfaces
and cracks, not building facades, so ImageNet reads a genuine photo as
`nematode` or `nail` and reads a screenshot of a room as `mobile_home`. Junk
outscored real photos on every building-shaped bucket, 0.20 mean against 0.05.
The gate therefore asserts the negative instead. See export_image_gate_model.py.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml"
MOBILE_OUT = ML_ROOT / "artifacts" / "mobile"
BACKEND = REPO_ROOT / "backend"

BUILDING_LABELS = {"low", "moderate", "high"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}

# Purpose-shot negatives, one folder per category. These are the set that makes
# the evaluation mean anything: image_labels.csv's `junk` rows are screenshots
# and indoor scenes, and contain no people, meals or vehicles at all.
NEGATIVE_ROOT = ML_ROOT / "data" / "newfeature"

# Interiors are NOT expected to be blocked, and the summary counts them apart
# for that reason. ATC-20 post-earthquake evaluation includes interior damage --
# a cracked ceiling or a failed partition is a legitimate assessment photo, so a
# gate that rejected rooms would break real inspection work. They are shot here
# to confirm the gate leaves them alone.
EXPECTED_ACCEPT = {"interior"}


def _load_spec() -> dict:
    path = MOBILE_OUT / "image_gate_buckets.json"
    if not path.is_file():
        raise SystemExit(f"Missing {path}. Run export_image_gate_model.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


def _collect_labelled() -> tuple[list[Path], list[Path]]:
    positives: list[Path] = []
    negatives: list[Path] = []

    labels_csv = ML_ROOT / "data" / "image_labels.csv"
    if not labels_csv.is_file():
        raise SystemExit(f"Missing {labels_csv}. Run relabel_workspace.py merge first.")

    with labels_csv.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            path = ML_ROOT / row["path"]
            if not path.is_file():
                continue
            label = row["label"].strip().lower()
            if label in BUILDING_LABELS:
                positives.append(path)
            elif label == "junk":
                negatives.append(path)

    quarantine = ML_ROOT / "data" / "images" / "_quarantine"
    if quarantine.is_dir():
        negatives.extend(
            p for p in sorted(quarantine.rglob("*")) if p.suffix.lower() in IMAGE_SUFFIXES
        )

    return positives, negatives


def _collect_negative_categories() -> dict[str, list[Path]]:
    """The purpose-shot negatives, keyed by folder name."""
    if not NEGATIVE_ROOT.is_dir():
        return {}
    categories: dict[str, list[Path]] = {}
    for folder in sorted(NEGATIVE_ROOT.iterdir()):
        if not folder.is_dir():
            continue
        images = [p for p in sorted(folder.rglob("*")) if p.suffix.lower() in IMAGE_SUFFIXES]
        if images:
            categories[folder.name] = images
    return categories


class Gate:
    """The exported gate, scored the same way the phone scores it."""

    def __init__(self, spec: dict) -> None:
        import numpy as np
        import tensorflow as tf

        # Reuse the server's loader so crop and resize match the device. A gate
        # measured on differently-framed images measures nothing useful.
        sys.path.insert(0, str(BACKEND))
        from app.services.ml_fusion_engine import _preprocess_image  # noqa: E402

        self._np = np
        self._preprocess = _preprocess_image
        self._interpreter = tf.lite.Interpreter(model_path=str(MOBILE_OUT / spec["model"]))
        self._interpreter.allocate_tensors()
        self._in = self._interpreter.get_input_details()[0]
        self._out = self._interpreter.get_output_details()[0]
        self._buckets = {k: np.array(v, dtype=np.int32) for k, v in spec["buckets"].items()}

    def masses(self, path: Path) -> dict[str, float] | None:
        np = self._np
        try:
            rgb = self._preprocess(path.read_bytes()).astype(np.float32)
        except Exception:
            return None
        self._interpreter.set_tensor(
            self._in["index"], np.expand_dims(rgb, 0).astype(self._in["dtype"])
        )
        self._interpreter.invoke()
        probs = self._interpreter.get_tensor(self._out["index"])[0]
        return {name: float(probs[idx].sum()) for name, idx in self._buckets.items()}


def _score_all(gate: Gate, paths: list[Path], label: str) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    for i, path in enumerate(paths, 1):
        if i % 250 == 0 or i == len(paths):
            print(f"  {label}: {i}/{len(paths)}", file=sys.stderr)
        masses = gate.masses(path)
        if masses is not None:
            out.append(masses)
    return out


def _verdict(masses: dict[str, float], spec: dict) -> str:
    blocking = set(spec.get("blocking", []))
    thresholds = spec["thresholds"]
    for name, mass in masses.items():
        if mass > thresholds.get(name, 1.0):
            return "block" if name in blocking else "warn"
    return "accept"


def _probe(gate: Gate, spec: dict, folder: Path) -> int:
    paths = [p for p in sorted(folder.rglob("*")) if p.suffix.lower() in IMAGE_SUFFIXES]
    if not paths:
        raise SystemExit(f"No images under {folder}")

    print(f"Probing {len(paths)} image(s) in {folder}\n")
    counts = {"accept": 0, "warn": 0, "block": 0}
    for path in paths:
        masses = gate.masses(path)
        if masses is None:
            print(f"  {path.name:40s} UNREADABLE")
            continue
        verdict = _verdict(masses, spec)
        counts[verdict] += 1
        top = sorted(masses.items(), key=lambda kv: -kv[1])[:2]
        detail = "  ".join(f"{k}={v:.3f}" for k, v in top)
        print(f"  {path.name:40s} {verdict.upper():7s} {detail}")

    print(f"\n{counts['block']} blocked, {counts['warn']} warned, {counts['accept']} accepted")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--probe",
        type=Path,
        help="score every image in a folder and print each verdict, instead of "
        "running the labelled evaluation",
    )
    parser.add_argument(
        "--max-false-block",
        type=float,
        default=0.005,
        help="share of genuine photos a blocking threshold may reject (default 0.005). "
        "Zero looks safest but buys almost no recall -- at a person threshold of 0.60 "
        "only 6 of 32 photos of people were caught. 0.5%% is roughly one retake in 200 "
        "captures, and the capture screen lets an inspector override a block anyway.",
    )
    parser.add_argument("--write-thresholds", action="store_true")
    args = parser.parse_args()

    import numpy as np

    spec = _load_spec()
    gate = Gate(spec)

    if args.probe:
        return _probe(gate, spec, args.probe)

    positives, negatives = _collect_labelled()
    categories = _collect_negative_categories()
    print(f"Genuine assessment photos: {len(positives)}")
    print(f"Junk (screenshots, indoor scenes, documents): {len(negatives)}")
    for name, paths in categories.items():
        suffix = "  (expected to be accepted)" if name in EXPECTED_ACCEPT else ""
        print(f"Shot negatives / {name}: {len(paths)}{suffix}")
    print()

    pos = _score_all(gate, positives, "genuine")
    neg = _score_all(gate, negatives, "junk")
    scored_categories = {
        name: _score_all(gate, paths, name) for name, paths in categories.items()
    }

    blocking = set(spec.get("blocking", []))
    chosen: dict[str, float] = {}

    print(f"\n{'bucket':17s} {'role':9s} {'p99':>7} {'max':>7} {'thresh':>7} "
          f"{'false':>7} {'junk hit':>9}")
    for name in spec["buckets"]:
        pos_mass = np.array([m[name] for m in pos])
        neg_mass = np.array([m[name] for m in neg])
        role = "block" if name in blocking else "warn"

        # Lowest threshold on a 0.05 grid whose collateral damage on genuine
        # photos stays inside budget. Lower fires more often, so the smallest
        # admissible value is the most useful one.
        admissible = [
            t
            for t in np.arange(0.15, 1.0, 0.05)
            if (pos_mass > t).mean() <= args.max_false_block
        ]
        threshold = float(admissible[0]) if admissible else 1.0
        chosen[name] = round(threshold, 3)

        print(
            f"{name:17s} {role:9s} {np.percentile(pos_mass, 99):7.3f} {pos_mass.max():7.3f} "
            f"{threshold:7.2f} {int((pos_mass > threshold).sum()):4d}/{len(pos_mass):<6d} "
            f"{int((neg_mass > threshold).sum()):4d}/{len(neg_mass)}"
        )

    def verdicts(rows: list[dict[str, float]]) -> dict[str, int]:
        counts = {"accept": 0, "warn": 0, "block": 0}
        local = {**spec, "thresholds": chosen}
        for row in rows:
            counts[_verdict(row, local)] += 1
        return counts

    pos_v, neg_v = verdicts(pos), verdicts(neg)
    print(
        f"\n{'set':22s} {'n':>5} {'blocked':>9} {'warned':>8} {'accepted':>9}"
    )
    print(
        f"{'genuine (must pass)':22s} {len(pos):5d} {pos_v['block']:9d} "
        f"{pos_v['warn']:8d} {pos_v['accept']:9d}"
    )
    print(f"{'junk (screenshots)':22s} {len(neg):5d} {neg_v['block']:9d} "
          f"{neg_v['warn']:8d} {neg_v['accept']:9d}")

    caught_total = shot_total = 0
    category_summary: dict[str, dict[str, int]] = {}
    for name, rows in scored_categories.items():
        counts = verdicts(rows)
        category_summary[name] = counts
        flagged = counts["block"] + counts["warn"]
        label = name if name not in EXPECTED_ACCEPT else f"{name} (should pass)"
        print(
            f"{label:22s} {len(rows):5d} {counts['block']:9d} "
            f"{counts['warn']:8d} {counts['accept']:9d}"
            f"   {'' if name in EXPECTED_ACCEPT else f'caught {flagged / max(1, len(rows)):.0%}'}"
        )
        if name not in EXPECTED_ACCEPT:
            caught_total += flagged
            shot_total += len(rows)

    false_block = pos_v["block"] / max(1, len(pos))
    print(
        f"\nFalse block rate on genuine photos: {false_block:.2%} "
        f"({pos_v['block']}/{len(pos)})"
    )
    if shot_total:
        print(
            f"Caught across the categories meant to be rejected: "
            f"{caught_total}/{shot_total} ({caught_total / shot_total:.0%})"
        )
    print(
        "\nBaseline (no gate): 0 rejected, 0 genuine photos blocked. Any catch rate above\n"
        "zero at a tolerable false-block rate is the gain. Interiors are excluded from the\n"
        "catch rate on purpose -- ATC-20 evaluates interior damage, so a room is a valid\n"
        "assessment photo and blocking one would break real inspection work."
    )

    if args.write_thresholds:
        spec["thresholds"] = chosen
        spec["evaluated_on"] = {
            "genuine": len(pos),
            "genuine_blocked": pos_v["block"],
            "genuine_warned": pos_v["warn"],
            "false_block_rate": round(false_block, 5),
            "junk": len(neg),
            "junk_flagged": neg_v["block"] + neg_v["warn"],
            "shot_negatives": {
                name: {"n": len(scored_categories[name]), **counts}
                for name, counts in category_summary.items()
            },
            "note": "Interiors are expected to pass: ATC-20 includes interior damage.",
        }
        path = MOBILE_OUT / "image_gate_buckets.json"
        path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
        print(f"\nWrote thresholds -> {path}")
        print("Stage to the app with: node mobile/scripts/stage-ml-assets.js")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
