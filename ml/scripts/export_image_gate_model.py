#!/usr/bin/env python3
"""
Export the image-validity gate: MobileNetV2 (ImageNet) -> TFLite.

  python ml/scripts/export_image_gate_model.py
  python ml/scripts/export_image_gate_model.py --copy-to-mobile

Writes ml/artifacts/mobile/image_gate.tflite and image_gate_buckets.json.

Why this exists
---------------
The RAPID pipeline will classify whatever it is handed. Point the camera at a
colleague, a parked motorcycle or a sheet of paper and the fused model still
returns a confident FEMA P-154 band, because nothing in it was ever asked
"is this a building?" -- the three training classes are all buildings, so the
question cannot be posed in that output space.

This is a separate pre-check, deliberately. The ResNet50 and Random Forest
artifacts are frozen and their pipeline is untouched: the gate runs before them
and decides whether a photo reaches them at all.

Why an off-the-shelf ImageNet model
-----------------------------------
Training a dedicated classifier would be stronger, but the labelled negatives on
hand are 72 `junk` rows in ml/data/image_labels.csv plus a handful of
quarantined screenshots -- enough to *evaluate* a gate, nowhere near enough to
*train* one that generalises to selfies, food and documents. ImageNet-1k needs
no training data of ours and already knows those categories.

Why it rejects rather than accepts
----------------------------------
The obvious design -- score "does this look like a building?" and block low
scores -- was built first and measured, and it does not work here. The training
photos for the image branch are not building facades; they are close-ups of
concrete surfaces and cracks. ImageNet reads a crack as `nematode`, `sidewinder`
or `nail` (a thin winding line on texture) and reads *screenshots of rooms* as
`mobile_home`, `window_screen` and `prison`. Measured over 1,602 real photos and
76 junk, the junk scored HIGHER on any sensible building bucket than the real
photos did -- mean 0.20 against 0.05. A building detector is simply the wrong
question to ask of this dataset.

So the gate asserts the negative instead: not "this is a building" but "this is
confidently a person / a meal / a pet / a vehicle". Those buckets are close to
silent on genuine assessment photos -- across all 1,602, none exceeds 0.06 for
food, pet or vehicle -- which is what lets the gate block on them without
costing an inspector a retake. It is a high-precision reject, not a classifier.

Scoring uses probability *mass* per bucket rather than the top-1 label, which is
what makes a noisy 1000-way classifier usable for a binary decision.

Preprocessing is baked into the exported graph. The ResNet export deliberately
does not do this, and the device consequently has to reimplement
preprocess_input in TypeScript -- which is exactly where an RGB/BGR bug lived
undetected. One fewer reimplementation is one fewer place for that to happen:
the phone hands this model plain 0-255 RGB and the graph does the rest.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml"
MOBILE_OUT = ML_ROOT / "artifacts" / "mobile"
MOBILE_MODELS = REPO_ROOT / "mobile" / "assets" / "models"

IMG_SIZE = 224

# ---------------------------------------------------------------------------
# Buckets
#
# Names are ImageNet-1k class names exactly as keras' imagenet_class_index.json
# spells them. Every name is checked against that index at export time: a typo
# would otherwise silently drop a class from its bucket and quietly weaken the
# gate, which is the sort of failure that surfaces only in a defence.
#
# BLOCKING buckets must be near-silent on genuine assessment photos, because a
# false block costs an inspector a retake and their trust in the app. Measured
# over all 1,602 labelled building photos (eval_image_gate.py):
#
#   bucket    p99     max      real photos above 0.6
#   person    0.150   0.558    0
#   food      0.031   0.064    0
#   pet       0.013   0.046    0
#   vehicle   0.018   0.053    0

# ImageNet-1k has no "person" class, so a photo of a person resolves to what
# they are wearing. That is the reliable signal a human is the subject.
PERSON = [
    "abaya", "academic_gown", "apron", "Band_Aid", "bathing_cap", "bearskin",
    "bib", "bikini", "bolo_tie", "bonnet", "bow_tie", "brassiere", "cardigan",
    "clog", "cowboy_boot", "cowboy_hat", "crash_helmet", "diaper",
    "face_powder", "feather_boa", "football_helmet", "fur_coat", "gasmask",
    "gown", "groom", "hair_slide", "hair_spray", "hoopskirt", "jean", "jersey",
    "kimono", "lab_coat", "lipstick", "Loafer", "maillot", "mask",
    "military_uniform", "miniskirt", "mitten", "mortarboard", "neck_brace",
    "necklace", "overskirt", "oxygen_mask", "pajama", "pickelhaube", "poncho",
    "running_shoe", "sandal", "sarong", "shower_cap", "ski_mask", "sock",
    "sombrero", "stethoscope", "stole", "suit", "sunglass", "sunglasses",
    "sunscreen", "sweatshirt", "swimming_trunks", "trench_coat", "vestment",
    "wig", "Windsor_tie",
]
# Deliberately NOT in PERSON, despite matching a clothing keyword search:
#   Cardigan      capitalised, it is the Welsh Corgi, not the garment
#   thatch        a roof -- the one class here most likely on a real building
#   shoe_shop, barber_chair, folding_chair, rocking_chair, bottlecap,
#   lens_cap, measuring_cup, hatchet, syringe
#                 objects named like apparel, or furniture a person sits on

FOOD = [
    "pizza", "cheeseburger", "hotdog", "bagel", "pretzel", "ice_cream",
    "ice_lolly", "French_loaf", "trifle", "espresso", "cup", "eggnog", "plate",
    "guacamole", "consomme", "hot_pot", "carbonara", "meat_loaf", "burrito",
    "mashed_potato", "banana", "orange", "lemon", "pineapple", "strawberry",
    "broccoli", "cauliflower", "cucumber", "bell_pepper", "corn", "mushroom",
    "chocolate_sauce", "dough", "red_wine", "beer_glass", "wine_bottle",
    "coffee_mug", "soup_bowl",
]

# Domestic animals only. Snakes, worms and insects are deliberately absent:
# `nematode` and `sidewinder` are the single strongest signals of a genuine
# crack photo (a thin winding line on a textured surface), so rejecting on them
# would block precisely the images the gate exists to let through.
PET = [
    "tabby", "tiger_cat", "Persian_cat", "Siamese_cat", "Egyptian_cat",
    "golden_retriever", "Labrador_retriever", "beagle", "pug", "Chihuahua",
    "German_shepherd", "toy_poodle", "Pomeranian",
]

VEHICLE = [
    "sports_car", "convertible", "minivan", "jeep", "limousine", "cab",
    "pickup", "moped", "motor_scooter", "mountain_bike", "tricycle",
    "school_bus", "trailer_truck", "tow_truck", "garbage_truck", "fire_engine",
    "ambulance", "racer", "beach_wagon", "car_wheel", "grille", "seat_belt",
]

# ADVISORY only -- this one overlaps real photos (p99 0.29, max 0.78), because a
# flat cracked wall and a document are both pale rectangles with dark lines on
# them. It warns and never blocks.
SCREEN_DOCUMENT = [
    "web_site", "screen", "monitor", "television", "laptop", "notebook",
    "desktop_computer", "cellular_telephone", "iPod", "hand-held_computer",
    "typewriter_keyboard", "photocopier", "binder", "file", "envelope", "menu",
    "book_jacket", "comic_book", "crossword_puzzle", "printer", "space_bar",
    "mouse", "remote_control",
]

BLOCKING_BUCKETS = ["person", "food", "pet", "vehicle"]


def _load_class_index() -> dict[int, str]:
    """ImageNet index -> class name, from keras' own bundled mapping."""
    import tensorflow as tf

    path = tf.keras.utils.get_file(
        "imagenet_class_index.json",
        "https://storage.googleapis.com/download.tensorflow.org/data/imagenet_class_index.json",
        cache_subdir="models",
    )
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return {int(index): entry[1] for index, entry in raw.items()}


def _build_buckets(class_index: dict[int, str]) -> dict:
    # name -> every index carrying it. ImageNet-1k is not name-unique: `maillot`
    # is two distinct classes (a swimsuit and a tights/leotard), and a plain
    # dict comprehension keeps whichever came last, silently halving that
    # bucket's mass on exactly the photos it exists to catch.
    by_name: dict[str, list[int]] = {}
    for index, name in class_index.items():
        by_name.setdefault(name, []).append(index)

    buckets = {
        "person": PERSON,
        "food": FOOD,
        "pet": PET,
        "vehicle": VEHICLE,
        "screen_document": SCREEN_DOCUMENT,
    }

    unknown = sorted(
        {name for names in buckets.values() for name in names if name not in by_name}
    )
    if unknown:
        raise SystemExit(
            "These bucket entries are not ImageNet-1k class names: "
            + ", ".join(unknown)
            + "\nFix the spelling in export_image_gate_model.py -- a silent miss "
            "would weaken the gate without any error."
        )

    # De-duplicated, first bucket wins, so a class listed twice cannot have its
    # probability counted twice.
    assigned: set[int] = set()
    indices: dict[str, list[int]] = {}
    for bucket, names in buckets.items():
        chosen = []
        for name in names:
            for index in by_name[name]:
                if index in assigned:
                    continue
                assigned.add(index)
                chosen.append(index)
        indices[bucket] = sorted(chosen)

    return indices


def export(copy_to_mobile: bool) -> int:
    import numpy as np
    import tensorflow as tf

    print("Loading MobileNetV2 (ImageNet weights)...")
    base = tf.keras.applications.MobileNetV2(
        weights="imagenet", include_top=True, input_shape=(IMG_SIZE, IMG_SIZE, 3)
    )

    # Preprocessing inside the graph: the phone passes 0-255 RGB and this
    # scales to [-1, 1]. See the module docstring for why that is deliberate.
    inputs = tf.keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3), dtype=tf.float32, name="rgb_0_255")
    scaled = tf.keras.layers.Rescaling(scale=1.0 / 127.5, offset=-1.0)(inputs)
    outputs = base(scaled, training=False)
    model = tf.keras.Model(inputs, outputs, name="image_gate")

    @tf.function(input_signature=[tf.TensorSpec([None, IMG_SIZE, IMG_SIZE, 3], tf.float32)])
    def infer(x):
        return model(x, training=False)

    converter = tf.lite.TFLiteConverter.from_concrete_functions([infer.get_concrete_function()])
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_types = [tf.float16]
    tflite_bytes = converter.convert()

    MOBILE_OUT.mkdir(parents=True, exist_ok=True)
    model_path = MOBILE_OUT / "image_gate.tflite"
    model_path.write_bytes(tflite_bytes)
    print(f"Wrote {model_path.name} ({len(tflite_bytes) / 1024 / 1024:.1f} MB)")

    class_index = _load_class_index()
    buckets = _build_buckets(class_index)

    spec = {
        "model": "image_gate.tflite",
        "backbone": "mobilenet_v2",
        "input": {
            "size": IMG_SIZE,
            "layout": "HWC",
            "channels": "RGB",
            "range": "0-255",
            "note": "Rescaling to [-1,1] is inside the graph. Do NOT preprocess on device.",
        },
        "output": {"classes": 1000, "activation": "softmax"},
        "buckets": buckets,
        # Which buckets may block a capture outright; the rest only warn.
        "blocking": BLOCKING_BUCKETS,
        # Per-bucket probability mass above which the gate fires. Set by
        # ml/scripts/eval_image_gate.py from the real labelled data, not guessed
        # here -- re-run it after any change to the buckets above. These
        # defaults are chosen so that zero of the 1,602 labelled assessment
        # photos are blocked.
        "thresholds": {
            "person": 0.6,
            "food": 0.6,
            "pet": 0.6,
            "vehicle": 0.6,
            "screen_document": 0.5,
        },
    }
    spec_path = MOBILE_OUT / "image_gate_buckets.json"
    spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
    counts = {k: len(v) for k, v in buckets.items()}
    print(f"Wrote {spec_path.name} (bucket sizes: {counts})")

    # Smoke-run so a broken conversion fails here rather than on a phone.
    interpreter = tf.lite.Interpreter(model_content=tflite_bytes)
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    interpreter.set_tensor(
        inp["index"], np.zeros((1, IMG_SIZE, IMG_SIZE, 3), dtype=inp["dtype"])
    )
    interpreter.invoke()
    probs = interpreter.get_tensor(out["index"])[0]
    print(f"Smoke test: output {probs.shape}, sums to {float(probs.sum()):.3f}")

    if copy_to_mobile:
        MOBILE_MODELS.mkdir(parents=True, exist_ok=True)
        for path in (model_path, spec_path):
            shutil.copy2(path, MOBILE_MODELS / path.name)
        print(f"Copied -> {MOBILE_MODELS}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--copy-to-mobile", action="store_true")
    args = parser.parse_args()
    return export(args.copy_to_mobile)


if __name__ == "__main__":
    raise SystemExit(main())
