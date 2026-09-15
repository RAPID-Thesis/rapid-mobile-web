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
        default=0.0,
        help="share of genuine photos a blocking threshold may reject (default 0.0)",
    )
    parser.add_argument("--write-thresholds", action="store_true")
    args = parser.parse_args()

    import numpy as np

    spec = _load_spec()
    gate = Gate(spec)

    if args.probe:
        return _probe(gate, spec, args.probe)

    positives, negatives = _collect_labelled()
    print(f"Genuine assessment photos: {len(positives)}")
    print(f"Junk (screenshots, indoor scenes, documents): {len(negatives)}\n")

    pos = _score_all(gate, positives, "genuine")
    neg = _score_all(gate, negatives, "junk")

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
            for t in np.arange(0.30, 1.0, 0.05)
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
        f"\nGenuine photos: {pos_v['block']} blocked, {pos_v['warn']} warned, "
        f"{pos_v['accept']} accepted  "
        f"(false block rate {pos_v['block'] / max(1, len(pos)):.4%})"
    )
    print(
        f"Junk:           {neg_v['block']} blocked, {neg_v['warn']} warned, "
        f"{neg_v['accept']} accepted"
    )
    print(
        "\nBaseline (today, no gate): 0 junk stopped, 0 genuine photos blocked.\n"
        "The gate's value over that baseline is not established by this set -- it holds\n"
        "no photos of people, food, pets or vehicles, which is what the blocking buckets\n"
        "target. Use --probe with real examples before quoting a detection rate."
    )

    if args.write_thresholds:
        spec["thresholds"] = chosen
        spec["evaluated_on"] = {
            "genuine": len(pos),
            "junk": len(neg),
            "genuine_blocked": pos_v["block"],
            "genuine_warned": pos_v["warn"],
            "junk_flagged": neg_v["block"] + neg_v["warn"],
            "note": "Junk set contains no people/food/pets/vehicles; "
            "blocking-bucket recall is unmeasured here.",
        }
        path = MOBILE_OUT / "image_gate_buckets.json"
        path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
        print(f"\nWrote thresholds -> {path}")
        print("Stage to the app with: node mobile/scripts/stage-ml-assets.js")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
