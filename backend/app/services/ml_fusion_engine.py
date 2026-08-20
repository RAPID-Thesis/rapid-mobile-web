"""
Dual-algorithm fusion engine: ResNet50 (imagery) + Random Forest (tabular) + Late Fusion.

Artifacts are loaded from ``MODEL_DIR`` (defaults to ``../ml/artifacts`` relative to
``backend/``). Heavy dependencies (TensorFlow, scikit-learn, joblib) are imported
lazily the first time a model is requested so that unit tests and migration scripts
that never touch inference do not pay the ~500 MB import cost.
"""

from __future__ import annotations

import gzip
import json
import logging
import math
import os
import shutil
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID

from .gemini_planner import generate_action_plan

logger = logging.getLogger(__name__)

# ---------- Configuration ----------

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent
_DEFAULT_MODEL_DIR = _REPO_ROOT / "ml" / "artifacts"
_DEFAULT_SRTM_DIR = _REPO_ROOT / "ml" / "data" / "gis" / "srtm"

MODEL_DIR = Path(os.getenv("MODEL_DIR", str(_DEFAULT_MODEL_DIR))).resolve()
SRTM_DIR = Path(os.getenv("SRTM_DIR", str(_DEFAULT_SRTM_DIR))).resolve()

IMAGE_WEIGHT = float(os.getenv("FUSION_IMAGE_WEIGHT", "0.45"))
TABULAR_WEIGHT = float(os.getenv("FUSION_TABULAR_WEIGHT", "0.55"))

# Class order used at training time (alphabetical under sklearn/keras conventions).
PRE_CLASSES = ("high", "low", "moderate")
POST_CLASSES = ("RESTRICTED", "SAFE", "UNSAFE")

# Canonical severity remap. Both phases share one visual severity model (see
# ml/train_resnet50.py); the ATC-20 names are a relabeling of the FEMA P-154 ones.
PRE_TO_POST = {"low": "SAFE", "moderate": "RESTRICTED", "high": "UNSAFE"}


def _resnet_output_classes(phase: str) -> tuple[str, ...]:
    """Class order the ResNet actually emits, which is NOT the canonical order for post.

    The network is trained by ``image_dataset_from_directory`` on folders named
    low/moderate/high, so its output axis is always alphabetical PRE order
    ``(high, low, moderate)``. Under the ATC-20 remap that is
    ``(UNSAFE, SAFE, RESTRICTED)`` -- whereas ``POST_CLASSES`` is alphabetical
    ``(RESTRICTED, SAFE, UNSAFE)``.

    Reading the raw output against POST_CLASSES therefore swapped UNSAFE and RESTRICTED:
    the most severely damaged buildings were posted "limited entry" instead of "do not
    enter", and the reverse. Probabilities must be re-keyed through this order before use.
    """
    if phase == "pre":
        return PRE_CLASSES
    return tuple(PRE_TO_POST[c] for c in PRE_CLASSES)


# ---------- Mobile → training-vocabulary mappings ----------

_MATERIAL_MAP = {
    "concrete hollow block (chb)": "concrete",
    "reinforced concrete (rc)": "concrete",
    "light wood frame": "wood",
    "steel frame": "mixed",
    "mixed use": "mixed",
    "concrete": "concrete",
    "wood": "wood",
    "mixed": "mixed",
}

_STRUCTURAL_SYSTEM_MAP = {
    "moment resisting frame": "moment_frame",
    "shear wall system": "shear_wall",
    # Unreinforced masonry is the most vulnerable common system in FEMA P-154 and the dominant
    # residential typology here (unreinforced CHB). It previously collapsed to "unknown"
    # because the training data had no such category, discarding the strongest vulnerability
    # signal an inspector can record. The category now exists in generate_synthetic_data.py.
    "unreinforced masonry": "unreinforced_masonry",
    "unreinforced_masonry": "unreinforced_masonry",
    "braced frame": "braced_frame",
    "moment_frame": "moment_frame",
    "shear_wall": "shear_wall",
    "wood_frame": "wood_frame",
    "braced_frame": "braced_frame",
    "unknown": "unknown",
}

_SOIL_MAP = {
    "type a/b - hard rock": "B",
    "type c - dense soil": "C",
    "type d - stiff soil": "D",
    "type e/f - soft/vulnerable": "E",
    "a": "A", "b": "B", "c": "C", "d": "D", "e": "E", "f": "F",
}

_FOUNDATION_MAP = {
    "shallow": "shallow",
    "deep": "deep",
    "mat": "mat",
    "pile": "deep",
    "raft": "mat",
    "unknown": "unknown",
}


# ---------- Lazy model registry ----------

_lock = threading.Lock()
_cache: dict[str, Any] = {}


def _rf_path(phase: str) -> Path:
    return MODEL_DIR / f"rf_{phase}.joblib"


def _resnet_path(phase: str) -> Path:
    return MODEL_DIR / f"resnet50_{phase}.keras"


def _load_rf(phase: str):
    key = f"rf_{phase}"
    if key in _cache:
        return _cache[key]
    with _lock:
        if key in _cache:
            return _cache[key]
        import joblib  # noqa: WPS433 (lazy import is intentional)

        path = _rf_path(phase)
        if not path.exists():
            raise FileNotFoundError(f"RF model not found at {path}; set MODEL_DIR or copy artifacts.")
        logger.info("Loading RF model %s", path)
        _cache[key] = joblib.load(path)
        return _cache[key]


def _load_resnet(phase: str):
    key = f"resnet_{phase}"
    if key in _cache:
        return _cache[key]
    with _lock:
        if key in _cache:
            return _cache[key]
        import tensorflow as tf  # noqa: WPS433

        path = _resnet_path(phase)
        if not path.exists():
            raise FileNotFoundError(f"ResNet50 model not found at {path}; set MODEL_DIR or copy artifacts.")
        logger.info("Loading ResNet50 model %s", path)
        _cache[key] = tf.keras.models.load_model(path, compile=False)
        return _cache[key]


def _classes_for(phase: str) -> tuple[str, ...]:
    return PRE_CLASSES if phase == "pre" else POST_CLASSES


def _phase_key(phase: str) -> str:
    """Normalize API phase strings (``pre-earthquake``) to artifact suffix (``pre``)."""
    p = phase.lower().strip()
    if p.startswith("pre"):
        return "pre"
    if p.startswith("post"):
        return "post"
    raise ValueError(f"Unknown phase: {phase!r}")


# ---------- Fault distance lookup (shared with the device) ----------
#
# The device computes distance_to_fault_km offline from ml/artifacts/mobile/sjdm_geo.json
# (see mobile/services/ml/geoLookup.ts). The server previously had no equivalent, so the
# feature arrived as None and the RF's median imputer filled it in -- silently discarding the
# single highest-weighted risk driver on every server-side prediction, and disagreeing with
# the device for the same building.
#
# Reading the same bundle and repeating the same nearest-segment math keeps the two paths in
# parity by construction rather than by convention.

GEO_BUNDLE_PATH = Path(
    os.getenv("GEO_BUNDLE_PATH", str(MODEL_DIR / "mobile" / "sjdm_geo.json"))
).resolve()

# Mirrors nearestFaultKm() in mobile/services/ml/geoLookup.ts: 999 sentinel, 25 km fallback.
_FAULT_SENTINEL_KM = 999.0
_FAULT_FALLBACK_KM = 25.0


def _load_geo_bundle() -> dict[str, Any] | None:
    if "_geo" in _cache:
        return _cache["_geo"]
    with _lock:
        if "_geo" in _cache:
            return _cache["_geo"]
        try:
            with open(GEO_BUNDLE_PATH, encoding="utf-8") as fh:
                _cache["_geo"] = json.load(fh)
        except Exception as exc:
            logger.warning(
                "Geo bundle unavailable at %s (%s); distance_to_fault_km will fall back to "
                "the RF's median imputation and will NOT match the device.",
                GEO_BUNDLE_PATH, exc,
            )
            _cache["_geo"] = None
        return _cache["_geo"]


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0
    p = math.pi / 180.0
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(dlon / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def _point_to_segment_km(plon: float, plat: float, a: list[float], b: list[float]) -> float:
    ax, ay, bx, by = a[0], a[1], b[0], b[1]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _haversine_km(plon, plat, ax, ay)
    t = max(0.0, min(1.0, ((plon - ax) * dx + (plat - ay) * dy) / (dx * dx + dy * dy)))
    return _haversine_km(plon, plat, ax + t * dx, ay + t * dy)


def _nearest_fault_km(lat: float, lon: float) -> float | None:
    """Distance to the nearest mapped fault segment, or None if the bundle is missing."""
    bundle = _load_geo_bundle()
    if not bundle:
        return None

    best = _FAULT_SENTINEL_KM
    for seg in bundle.get("fault_segments", []):
        for i in range(len(seg) - 1):
            d = _point_to_segment_km(lon, lat, seg[i], seg[i + 1])
            if d < best:
                best = d
    return best if best < 900 else _FAULT_FALLBACK_KM


# ---------- SRTM elevation / slope lookup ----------

_SRTM_TILE_NAME = "N14E121.hgt"
_SRTM_TILE_GZ_URL = "https://elevation-tiles-prod.s3.amazonaws.com/skadi/N14/N14E121.hgt.gz"
_SRTM_SAMPLES = 3601
_SRTM_LAT = 14
_SRTM_LON = 121


def _ensure_srtm() -> Path | None:
    hgt_path = SRTM_DIR / _SRTM_TILE_NAME
    if hgt_path.exists():
        return hgt_path

    SRTM_DIR.mkdir(parents=True, exist_ok=True)
    try:
        import urllib.request

        logger.info("Downloading SRTM tile %s", _SRTM_TILE_GZ_URL)
        with urllib.request.urlopen(_SRTM_TILE_GZ_URL, timeout=30) as resp:
            gz_bytes = resp.read()
        with gzip.open(BytesIO(gz_bytes)) as src, open(hgt_path, "wb") as dst:
            shutil.copyfileobj(src, dst)
        return hgt_path
    except Exception as exc:  # pragma: no cover
        logger.warning("SRTM download failed: %s", exc)
        return None


def _load_srtm_array():
    if "_srtm" in _cache:
        return _cache["_srtm"]
    with _lock:
        if "_srtm" in _cache:
            return _cache["_srtm"]
        import numpy as np  # noqa: WPS433

        hgt = _ensure_srtm()
        if hgt is None:
            _cache["_srtm"] = None
            _cache["_slope"] = None
            return None
        dem = np.fromfile(hgt, dtype=">i2").reshape(_SRTM_SAMPLES, _SRTM_SAMPLES).astype(np.float32)
        dem[dem == -32768] = np.nan

        dz_dy, dz_dx = np.gradient(dem, 30.0)  # ~30 m per sample
        slope = np.degrees(np.arctan(np.sqrt(dz_dx**2 + dz_dy**2)))

        _cache["_srtm"] = dem
        _cache["_slope"] = slope
        return dem


def _sample_srtm(lat: float, lon: float) -> tuple[float | None, float | None]:
    """Return ``(elevation_m, slope_deg)`` for the given point, or ``(None, None)`` on failure."""
    dem = _load_srtm_array()
    slope = _cache.get("_slope")
    if dem is None or slope is None:
        return None, None

    if not (_SRTM_LAT <= lat < _SRTM_LAT + 1 and _SRTM_LON <= lon < _SRTM_LON + 1):
        return None, None

    row = int(round((_SRTM_LAT + 1 - lat) * (_SRTM_SAMPLES - 1)))
    col = int(round((lon - _SRTM_LON) * (_SRTM_SAMPLES - 1)))
    row = max(0, min(_SRTM_SAMPLES - 1, row))
    col = max(0, min(_SRTM_SAMPLES - 1, col))

    elev = dem[row, col]
    slp = slope[row, col]
    if not math.isfinite(elev) or not math.isfinite(slp):
        return None, None
    return float(elev), float(slp)


# ---------- Image preprocessing ----------

def _preprocess_image(raw: bytes):
    """EXIF-rotate, center-crop square, resize to 224×224, return ``(H, W, 3)`` uint8 array."""
    from PIL import Image, ImageOps  # noqa: WPS433
    import numpy as np  # noqa: WPS433

    img = ImageOps.exif_transpose(Image.open(BytesIO(raw)).convert("RGB"))
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((224, 224), Image.BILINEAR)
    return np.asarray(img, dtype=np.uint8)


# ---------- Tabular feature construction ----------

@dataclass
class TabularInput:
    """Minimal structured record passed to the Random Forest."""

    year_built: int | None
    number_of_stories: int
    building_use: str
    soil_classification: str | None
    distance_to_fault_km: float | None
    elevation_m: float | None
    slope_deg: float | None
    previous_retrofit: bool
    structural_system: str | None
    foundation_type: str | None
    material: str | None


def _norm(value: Any, mapping: dict[str, str], default: str = "unknown") -> str:
    if value is None:
        return default
    key = str(value).strip().lower()
    return mapping.get(key, default)


def build_tabular_input(
    *,
    building: dict,
    structural_data: dict,
) -> TabularInput:
    """Map Building + structural_data (free-form dict from the mobile form) to RF inputs.

    Falls back to sensible defaults; missing numerics are imputed by the RF pipeline
    via its internal median imputer, and missing categoricals become ``"unknown"``.
    """
    sd = structural_data or {}

    year_built = sd.get("year_built") or building.get("year_built")
    try:
        year_built = int(year_built) if year_built not in (None, "", "null") else None
    except (TypeError, ValueError):
        year_built = None

    stories = sd.get("stories") or sd.get("number_of_stories") or building.get("number_of_stories") or 1
    try:
        stories = int(stories)
    except (TypeError, ValueError):
        stories = 1

    latitude = building.get("latitude") or sd.get("latitude")
    longitude = building.get("longitude") or sd.get("longitude")

    elev = sd.get("elevation_m")
    slope = sd.get("slope_deg")
    if (elev is None or slope is None) and latitude is not None and longitude is not None:
        auto_elev, auto_slope = _sample_srtm(float(latitude), float(longitude))
        elev = elev if elev is not None else auto_elev
        slope = slope if slope is not None else auto_slope

    # The mobile wizard does not submit fault distance -- it is derived from the GPS fix on the
    # device and must be derived the same way here, or the RF loses its top-weighted feature.
    fault_km = _to_float(
        sd.get("distance_to_fault_km") or building.get("distance_to_fault_km")
    )
    if fault_km is None and latitude is not None and longitude is not None:
        fault_km = _nearest_fault_km(float(latitude), float(longitude))

    return TabularInput(
        year_built=year_built,
        number_of_stories=stories,
        building_use=str(building.get("building_use") or sd.get("building_use") or "residential").lower(),
        soil_classification=_norm(
            sd.get("soil_classification") or sd.get("soilClass") or building.get("soil_classification"),
            _SOIL_MAP,
            default="D",
        ),
        distance_to_fault_km=fault_km,
        elevation_m=_to_float(elev),
        slope_deg=_to_float(slope),
        previous_retrofit=bool(sd.get("previous_retrofit") or building.get("previous_retrofit") or False),
        structural_system=_norm(
            sd.get("structural_system") or sd.get("structuralSystem") or building.get("structural_system"),
            _STRUCTURAL_SYSTEM_MAP,
        ),
        foundation_type=_norm(
            sd.get("foundation_type") or sd.get("foundationType") or building.get("foundation_type"),
            _FOUNDATION_MAP,
        ),
        material=_norm(
            sd.get("material") or sd.get("primaryMaterial") or building.get("material"),
            _MATERIAL_MAP,
        ),
    )


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _tabular_to_dataframe(t: TabularInput):
    import pandas as pd  # noqa: WPS433

    row = {
        "year_built": t.year_built,
        "building_age": (2026 - t.year_built) if t.year_built is not None else None,
        "number_of_stories": t.number_of_stories,
        "building_use": t.building_use,
        "soil_classification": t.soil_classification,
        "distance_to_fault_km": t.distance_to_fault_km,
        "elevation_m": t.elevation_m,
        "slope_deg": t.slope_deg,
        "previous_retrofit_as_int": int(bool(t.previous_retrofit)),
        "structural_system": t.structural_system,
        "foundation_type": t.foundation_type,
        "material": t.material,
    }
    return pd.DataFrame([row])


# ---------- Inference primitives ----------

def predict_image(images: list[bytes], phase: str) -> dict[str, Any]:
    """Run ResNet50 on 1–N images; average probabilities across the batch."""
    if not images:
        raise ValueError("predict_image requires at least one image.")

    import numpy as np  # noqa: WPS433

    phase_key = _phase_key(phase)
    model = _load_resnet(phase_key)
    classes = _classes_for(phase_key)

    batch = np.stack([_preprocess_image(b) for b in images], axis=0)
    probs = model.predict(batch, verbose=0)
    mean_probs = probs.mean(axis=0)

    # Re-key from the network's own output order into the canonical order for this phase.
    # For "post" these differ, and reading the raw axis directly swapped UNSAFE/RESTRICTED.
    output_classes = _resnet_output_classes(phase_key)
    by_class = {cls: float(p) for cls, p in zip(output_classes, mean_probs, strict=True)}
    ordered = [by_class[cls] for cls in classes]
    idx = int(np.argmax(ordered))

    return {
        "label": classes[idx],
        "confidence": float(ordered[idx]),
        "probabilities": {cls: by_class[cls] for cls in classes},
        "image_count": len(images),
    }


def predict_tabular(tabular: TabularInput, phase: str) -> dict[str, Any]:
    """Run the Random Forest pipeline on a single structured row."""
    import numpy as np  # noqa: WPS433

    phase_key = _phase_key(phase)
    model = _load_rf(phase_key)
    classes = tuple(str(c) for c in model.classes_)

    df = _tabular_to_dataframe(tabular)
    probs = model.predict_proba(df)[0]
    idx = int(np.argmax(probs))

    importances = _top_feature_importance(model, top_k=8)

    return {
        "label": classes[idx],
        "confidence": float(probs[idx]),
        "probabilities": {cls: float(p) for cls, p in zip(classes, probs, strict=True)},
        "feature_importance": importances,
    }


def _top_feature_importance(pipeline, top_k: int = 8) -> dict[str, float]:
    try:
        preprocess = pipeline.named_steps["preprocess"]
        clf = pipeline.named_steps["classifier"]
        names = preprocess.get_feature_names_out()
        pairs = sorted(
            zip(names, clf.feature_importances_, strict=True),
            key=lambda t: t[1],
            reverse=True,
        )[:top_k]
        return {str(n): float(v) for n, v in pairs}
    except Exception:  # pragma: no cover
        return {}


def predict_fused(
    *,
    images: list[bytes] | None,
    tabular: TabularInput | None,
    phase: str,
    image_weight: float = IMAGE_WEIGHT,
    tabular_weight: float = TABULAR_WEIGHT,
) -> dict[str, Any]:
    """Late fusion with graceful degradation when one modality is missing."""
    import numpy as np  # noqa: WPS433

    phase_key = _phase_key(phase)
    classes = _classes_for(phase_key)

    image_result = predict_image(images, phase_key) if images else None
    tabular_result = predict_tabular(tabular, phase_key) if tabular else None

    if image_result is None and tabular_result is None:
        raise ValueError("predict_fused requires at least one modality.")

    def _vec(result: dict[str, Any] | None) -> Any | None:
        if result is None:
            return None
        return np.array([result["probabilities"].get(c, 0.0) for c in classes], dtype=np.float64)

    image_vec = _vec(image_result)
    tabular_vec = _vec(tabular_result)

    if image_vec is None:
        fused = tabular_vec
        weights = {"image": 0.0, "tabular": 1.0}
    elif tabular_vec is None:
        fused = image_vec
        weights = {"image": 1.0, "tabular": 0.0}
    else:
        total = image_weight + tabular_weight
        iw, tw = image_weight / total, tabular_weight / total
        fused = iw * image_vec + tw * tabular_vec
        weights = {"image": iw, "tabular": tw}

    idx = int(np.argmax(fused))
    return {
        "phase": phase_key,
        "label": classes[idx],
        "confidence": float(fused[idx]),
        "probabilities": {cls: float(p) for cls, p in zip(classes, fused, strict=True)},
        "weights": weights,
        "image": image_result,
        "tabular": tabular_result,
    }


# ---------- Background assessment pipeline ----------

async def process_assessment(assessment_id: UUID) -> None:
    """Run full inference for a saved assessment and persist the results."""
    # Local imports keep the ML/TF stack out of app startup paths.
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from ..models import Assessment, SessionLocal
    from ..supabase_client import get_supabase_admin

    db = SessionLocal()
    try:
        assessment = db.scalar(
            select(Assessment)
            .options(selectinload(Assessment.images), selectinload(Assessment.building))
            .where(Assessment.id == assessment_id)
        )
        if assessment is None:
            logger.warning("process_assessment: assessment %s not found", assessment_id)
            return

        logger.info(
            "process_assessment: starting ML pipeline for %s (first run may load TensorFlow for ~30-120s; silence until then is normal)",
            assessment_id,
        )

        building = assessment.building
        supabase = get_supabase_admin()

        image_bytes: list[bytes] = []
        for img in assessment.images:
            try:
                blob = supabase.storage.from_("assessment-images").download(img.storage_path)
                if isinstance(blob, bytes) and blob:
                    image_bytes.append(blob)
            except Exception as exc:
                logger.warning("Failed to download %s: %s", img.storage_path, exc)

        tabular = build_tabular_input(
            building={
                "year_built": building.year_built,
                "number_of_stories": building.number_of_stories,
                "building_use": building.building_use,
                "soil_classification": building.soil_classification,
                "distance_to_fault_km": building.distance_to_fault_km,
                "previous_retrofit": building.previous_retrofit,
                "latitude": building.latitude,
                "longitude": building.longitude,
                "structural_system": building.structural_system,
                "foundation_type": building.foundation_type,
            },
            structural_data=assessment.structural_data or {},
        )

        result = predict_fused(
            images=image_bytes or None,
            tabular=tabular,
            phase=assessment.phase,
        )

        img_out = result.get("image")
        tab_out = result.get("tabular")

        assessment.ai_image_label = img_out["label"] if img_out else None
        assessment.ai_image_confidence = img_out["confidence"] if img_out else None
        assessment.ai_image_probabilities = img_out["probabilities"] if img_out else None
        assessment.ai_tabular_label = tab_out["label"] if tab_out else None
        assessment.ai_tabular_confidence = tab_out["confidence"] if tab_out else None
        assessment.ai_feature_importance = tab_out["feature_importance"] if tab_out else None
        assessment.ai_fused_label = result["label"]
        assessment.ai_fused_confidence = result["confidence"]
        assessment.ai_fusion_weights = result["weights"]

        try:
            recs = generate_action_plan(
                phase=_phase_key(assessment.phase),
                label=result["label"],
                confidence=result["confidence"],
                building={
                    "building_code": building.building_code,
                    "address": building.address,
                    "barangay": building.barangay,
                    "municipality": building.municipality,
                    "year_built": building.year_built,
                    "number_of_stories": building.number_of_stories,
                    "building_use": building.building_use,
                },
            )
            assessment.action_recommendations = recs["recommendations"]
            assessment.action_generated_by = recs["generated_by"]
            assessment.action_generated_at = datetime.now(timezone.utc)
        except Exception as exc:
            logger.warning("Action plan generation failed: %s", exc)

        # Simple priority score: confidence × label severity. UNSAFE/high dominate.
        severity = {
            "low": 0.3, "moderate": 0.6, "high": 1.0,
            "SAFE": 0.3, "RESTRICTED": 0.6, "UNSAFE": 1.0,
        }.get(result["label"], 0.5)
        assessment.priority_score = round(result["confidence"] * severity, 4)
        assessment.status = "pending-review"
        assessment.updated_at = datetime.now(timezone.utc)

        db.commit()
        logger.info(
            "Assessment %s inferred: %s (%.3f)",
            assessment_id, result["label"], result["confidence"],
        )
    except Exception as exc:  # pragma: no cover
        logger.exception("process_assessment failed for %s: %s", assessment_id, exc)
        db.rollback()
    finally:
        db.close()


__all__ = [
    "IMAGE_WEIGHT",
    "TABULAR_WEIGHT",
    "TabularInput",
    "build_tabular_input",
    "predict_fused",
    "predict_image",
    "predict_tabular",
    "process_assessment",
]
