"""
Semi-synthetic tabular rows for RF training.

- Loads real active fault lines from a government .shp via geopandas.
- Draws random building locations strictly inside the study area polygon (default: San Jose del Monte, Bulacan via OSM Nominatim or GeoJSON).
- Downloads SRTM 30m DEM (N14E121 tile) for real elevation; derives slope.
- Assigns soil_classification from SJDM soil map zones (Novaliches Clay Loam, Novaliches Loam, Sibul Clay) mapped to elevation bands.
- Computes shortest distance from each point to the nearest fault segment (projected CRS).
- Synthesizes remaining attributes using FEMA P-154-inspired rules (age, material, stories, etc.).
- Assigns pre-EQ labels (low/moderate/high) and post-EQ triage labels (SAFE/RESTRICTED/UNSAFE) via score tertiles.

Usage:
  pip install -r requirements.txt
  python scripts/generate_synthetic_data.py --n 5000

Default GIS inputs (project layout):
  ml/data/gis/data/H_VFS_PHIVOLCS/H_VFS_ALL_PHIVOLCS_PL.shp  -- Valley Fault System (line layer) for distance_to_fault_km
  ml/data/gis/data/H_LIQ_PHIVOLCS_BUL/H_LIQ_{LOW,MOD,HIGH}_PHIVOLCS.shp -- liquefaction hazard polygons (optional soil override)
  Soil_Map_SJDM.png / Contour_Map_SJDM.png -- visual reference only; elevation from SRTM

Environment:
  NOMINATIM_USER_AGENT  optional override for OSM Nominatim User-Agent (default: RAPID-Thesis/1.0).
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import struct
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from shapely.geometry import Point, shape

RNG = np.random.default_rng(42)

PROJECTED_CRS = "EPSG:32651"  # UTM zone 51N (meters) — Metro Manila / Central Luzon

BUILDING_USES = ["residential", "commercial", "institutional", "industrial", "mixed"]
SOILS = ["A", "B", "C", "D", "E", "F"]
STRUCTURAL = ["moment_frame", "shear_wall", "braced_frame", "wood_frame", "unknown"]
FOUNDATIONS = ["shallow", "deep", "mat", "unknown"]
MATERIALS = ["concrete", "wood", "mixed"]

CURRENT_YEAR = 2026

SUBDIR_VFS = "H_VFS_PHIVOLCS"
SUBDIR_LIQ = "H_LIQ_PHIVOLCS_BUL"
DEFAULT_FAULT_BASENAME = "H_VFS_ALL_PHIVOLCS_PL.shp"
LIQ_TIER_TO_SOIL = {"LOW": "C", "MOD": "D", "HIGH": "E"}
DEFAULT_STUDY_AREA_NOMINATIM_QUERY = "San Jose del Monte, Bulacan, Philippines"

# ---------- SRTM DEM constants ----------
# SJDM sits inside the N14E121 SRTM tile (14-15 N, 121-122 E).
SRTM_TILE_URL = "https://elevation-tiles-prod.s3.amazonaws.com/skadi/N14/N14E121.hgt.gz"
SRTM_TILE_NAME = "N14E121.hgt"
SRTM_SAMPLES = 3601  # 1-arc-second SRTM3 tiles are 3601x3601
SRTM_TILE_LAT = 14
SRTM_TILE_LON = 121

# ---------- SJDM Soil Map zones (from Soil_Map_SJDM.png) ----------
# Three soil types mapped to elevation bands observed on the government soil map.
# Novaliches Clay Loam (lowland alluvial) -> soft clay -> NEHRP D
# Novaliches Loam (transitional mid-elevation) -> medium stiffness -> NEHRP C
# Sibul Clay (highland residual clay) -> stiffer -> NEHRP C (with some B on outcrops)
SJDM_SOIL_ZONES = [
    {"name": "Novaliches Clay Loam", "elev_max": 80, "nehrp": "D", "nehrp_alt": "E", "alt_prob": 0.15},
    {"name": "Novaliches Loam", "elev_min": 80, "elev_max": 160, "nehrp": "C", "nehrp_alt": "D", "alt_prob": 0.20},
    {"name": "Sibul Clay", "elev_min": 160, "nehrp": "C", "nehrp_alt": "B", "alt_prob": 0.10},
]


def default_gis_data_dir(ml_root: Path) -> Path:
    return ml_root / "data" / "gis" / "data"


# ==================== weight helpers ====================

def _soil_weight(soil: str) -> float:
    return {"A": 0.0, "B": 0.08, "C": 0.18, "D": 0.32, "E": 0.48, "F": 0.62}[soil]


def _use_weight(use: str) -> float:
    return {"residential": 0.05, "commercial": 0.12, "institutional": 0.18, "industrial": 0.1, "mixed": 0.14}[use]


def _material_weight(mat: str) -> float:
    return {"concrete": 0.0, "mixed": 0.12, "wood": 0.22}[mat]


def _structural_weight(sys: str) -> float:
    return {"shear_wall": 0.05, "moment_frame": 0.1, "braced_frame": 0.12, "wood_frame": 0.28, "unknown": 0.2}[sys]


def _foundation_weight(ft: str) -> float:
    return {"deep": 0.04, "mat": 0.06, "shallow": 0.14, "unknown": 0.18}[ft]


# ==================== SRTM DEM ====================

def download_srtm_tile(cache_dir: Path) -> Path:
    """Download N14E121.hgt.gz from AWS, unzip, cache locally. Returns path to .hgt."""
    hgt_path = cache_dir / SRTM_TILE_NAME
    if hgt_path.is_file() and hgt_path.stat().st_size > 1_000_000:
        return hgt_path
    cache_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading SRTM tile from {SRTM_TILE_URL}...", file=sys.stderr)
    r = requests.get(SRTM_TILE_URL, timeout=120)
    r.raise_for_status()
    raw = gzip.decompress(r.content)
    hgt_path.write_bytes(raw)
    print(f"Cached SRTM tile -> {hgt_path} ({len(raw)} bytes)", file=sys.stderr)
    return hgt_path


def load_srtm_array(hgt_path: Path) -> np.ndarray:
    """Read a 1-arc-second .hgt as a 2D int16 array (rows=lat descending, cols=lon ascending)."""
    data = hgt_path.read_bytes()
    n = SRTM_SAMPLES
    expected = n * n * 2
    if len(data) != expected:
        raise ValueError(f"SRTM tile size mismatch: got {len(data)}, expected {expected}")
    arr = np.frombuffer(data, dtype=">i2").reshape((n, n)).astype(np.float32)
    arr[arr == -32768] = np.nan  # SRTM void
    return arr


def sample_elevation(lat: list[float], lon: list[float], dem: np.ndarray) -> np.ndarray:
    """Bilinear interpolation of elevation from DEM for each (lat, lon) in WGS84."""
    n = SRTM_SAMPLES
    res = 1.0 / (n - 1)
    elevations = np.zeros(len(lat), dtype=np.float32)
    for i in range(len(lat)):
        row_f = (SRTM_TILE_LAT + 1 - lat[i]) / res
        col_f = (lon[i] - SRTM_TILE_LON) / res
        r0 = int(np.floor(row_f))
        c0 = int(np.floor(col_f))
        r0 = max(0, min(r0, n - 2))
        c0 = max(0, min(c0, n - 2))
        dr = row_f - r0
        dc = col_f - c0
        z00 = dem[r0, c0]
        z01 = dem[r0, c0 + 1]
        z10 = dem[r0 + 1, c0]
        z11 = dem[r0 + 1, c0 + 1]
        vals = [z00, z01, z10, z11]
        if any(np.isnan(v) for v in vals):
            elevations[i] = np.nanmean(vals) if not all(np.isnan(v) for v in vals) else 0.0
        else:
            elevations[i] = z00 * (1 - dr) * (1 - dc) + z01 * (1 - dr) * dc + z10 * dr * (1 - dc) + z11 * dr * dc
    return elevations


def compute_slope_from_dem(dem: np.ndarray, cell_size_m: float = 30.0) -> np.ndarray:
    """Compute slope in degrees from a DEM array. Returns same-shaped array."""
    filled = np.where(np.isnan(dem), 0.0, dem)
    dy, dx = np.gradient(filled, cell_size_m)
    return np.degrees(np.arctan(np.sqrt(dx ** 2 + dy ** 2)))


def sample_slope(
    lat: list[float], lon: list[float], slope_arr: np.ndarray
) -> np.ndarray:
    """Nearest-neighbor slope sampling at each point."""
    n = SRTM_SAMPLES
    res = 1.0 / (n - 1)
    slopes = np.zeros(len(lat), dtype=np.float32)
    for i in range(len(lat)):
        r = int(round((SRTM_TILE_LAT + 1 - lat[i]) / res))
        c = int(round((lon[i] - SRTM_TILE_LON) / res))
        r = max(0, min(r, n - 1))
        c = max(0, min(c, n - 1))
        slopes[i] = slope_arr[r, c]
    return slopes


# ==================== Soil from SJDM Soil Map ====================

def assign_soil_from_elevation(
    elevations: np.ndarray, rng: np.random.Generator
) -> list[tuple[str, str]]:
    """
    Map elevation to SJDM soil type and NEHRP class based on the government soil map.
    Returns list of (soil_name, nehrp_class).
    """
    out: list[tuple[str, str]] = []
    for elev in elevations:
        zone = SJDM_SOIL_ZONES[-1]  # default to highest
        for z in SJDM_SOIL_ZONES:
            lo = z.get("elev_min", -9999)
            hi = z.get("elev_max", 99999)
            if lo <= elev < hi:
                zone = z
                break
        if rng.random() < zone["alt_prob"]:
            nehrp = zone["nehrp_alt"]
        else:
            nehrp = zone["nehrp"]
        out.append((zone["name"], nehrp))
    return out


# ==================== Fault lines ====================

def load_fault_lines(shp_path: Path) -> gpd.GeoDataFrame:
    if not shp_path.is_file():
        raise FileNotFoundError(f"Fault shapefile not found: {shp_path}")
    gdf = gpd.read_file(shp_path)
    if gdf.empty:
        raise ValueError("Fault GeoDataFrame is empty.")
    if gdf.crs is None:
        raise ValueError("Fault layer has no CRS.")
    gdf = gdf.explode(index_parts=False).reset_index(drop=True)
    gdf = gdf[
        gdf.geometry.geom_type.isin(["LineString", "MultiLineString"])
        & gdf.geometry.notna()
    ].copy()
    if gdf.empty:
        raise ValueError("Fault layer has no line geometries after filtering.")
    return gdf


def load_phivolcs_liquefaction_polygons(gis_data_dir: Path) -> gpd.GeoDataFrame | None:
    base = gis_data_dir / SUBDIR_LIQ
    specs: list[tuple[str, str]] = [
        ("H_LIQ_LOW_PHIVOLCS.shp", "LOW"),
        ("H_LIQ_MOD_PHIVOLCS.shp", "MOD"),
        ("H_LIQ_HIGH_PHIVOLCS.shp", "HIGH"),
    ]
    frames: list[gpd.GeoDataFrame] = []
    for fname, tier in specs:
        p = base / fname
        if not p.is_file():
            print(f"Warning: liquefaction layer missing, skip {tier}: {p}", file=sys.stderr)
            continue
        g = gpd.read_file(p)
        if g.crs is None:
            raise ValueError(f"Liquefaction layer has no CRS: {p}")
        g = g.to_crs("EPSG:4326")
        g["liq_tier"] = tier
        frames.append(g[["geometry", "liq_tier"]])
    if not frames:
        return None
    merged = pd.concat(frames, ignore_index=True)
    return gpd.GeoDataFrame(merged, geometry="geometry", crs="EPSG:4326")


def point_liquefaction_tiers(
    lon: list[float], lat: list[float], liq: gpd.GeoDataFrame
) -> list[str | None]:
    rank = {"HIGH": 3, "MOD": 2, "LOW": 1}
    pts = gpd.GeoDataFrame(
        {"pt_id": range(len(lon))},
        geometry=[Point(xy) for xy in zip(lon, lat, strict=True)],
        crs="EPSG:4326",
    )
    joined = pts.sjoin(liq, predicate="within", how="left")
    out: list[str | None] = [None] * len(lon)
    for pid in range(len(lon)):
        sub = joined[joined["pt_id"] == pid]
        valid = sub["liq_tier"].dropna()
        if valid.empty:
            continue
        out[pid] = max(valid.astype(str), key=lambda t: rank[str(t)])
    return out


# ==================== Study area ====================

def fetch_study_area_boundary_from_nominatim(query: str) -> gpd.GeoDataFrame:
    ua = os.environ.get("NOMINATIM_USER_AGENT", "RAPID-Thesis/1.0 (tabular-data-generator)")
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": query, "format": "json", "polygon_geojson": 1, "limit": 1}
    headers = {"User-Agent": ua}
    r = requests.get(url, params=params, headers=headers, timeout=120)
    r.raise_for_status()
    data = r.json()
    if not data:
        raise RuntimeError("Nominatim returned no polygon. Save a GeoJSON and pass --boundary.")
    geo = data[0].get("geojson")
    if geo is None:
        raise RuntimeError("Nominatim returned no polygon. Save a GeoJSON and pass --boundary.")
    return gpd.GeoDataFrame(geometry=[shape(geo)], crs="EPSG:4326")


def load_boundary_vector(path: Path) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        gdf.set_crs("EPSG:4326", inplace=True)
    return gdf


def primary_polygon(gdf: gpd.GeoDataFrame):
    s = gdf.geometry
    geom = s.union_all() if hasattr(s, "union_all") else s.unary_union
    if geom.geom_type == "MultiPolygon":
        return max(geom.geoms, key=lambda p: p.area)
    if geom.geom_type == "Polygon":
        return geom
    raise ValueError(f"Unsupported boundary geometry: {geom.geom_type}")


def random_points_in_polygon(
    poly, n: int, rng: np.random.Generator
) -> tuple[list[float], list[float]]:
    minx, miny, maxx, maxy = poly.bounds
    lons: list[float] = []
    lats: list[float] = []
    while len(lons) < n:
        x = float(rng.uniform(minx, maxx))
        y = float(rng.uniform(miny, maxy))
        if poly.contains(Point(x, y)):
            lons.append(x)
            lats.append(y)
    return lons, lats


def nearest_fault_distance_km(
    lon: list[float], lat: list[float], faults: gpd.GeoDataFrame
) -> np.ndarray:
    pts = gpd.GeoDataFrame(
        geometry=[Point(xy) for xy in zip(lon, lat, strict=True)],
        crs="EPSG:4326",
    )
    pts_p = pts.to_crs(PROJECTED_CRS)
    f_p = faults.to_crs(PROJECTED_CRS)
    joined = pts_p.sjoin_nearest(f_p, distance_col="dist_m")
    joined = joined.sort_values("dist_m").groupby(level=0, sort=False).first()
    missing = pts_p.index.difference(joined.index)
    if len(missing) > 0:
        raise RuntimeError(f"sjoin_nearest missed {len(missing)} points.")
    dist_m = joined["dist_m"].reindex(pts_p.index)
    return (dist_m.to_numpy(dtype=np.float64) / 1000.0)


# ==================== Attribute synthesis ====================

def fema_p154_sample_attributes(
    n: int,
    distance_to_fault_km: np.ndarray,
    elevations: np.ndarray,
    soil_nehrp: list[str],
    rng: np.random.Generator,
) -> pd.DataFrame:
    rows = []
    for i in range(n):
        use = rng.choice(BUILDING_USES, p=[0.62, 0.12, 0.08, 0.08, 0.10])

        if use == "residential":
            stories = int(rng.integers(1, 5))
        elif use in ("commercial", "mixed"):
            stories = int(rng.integers(1, 9))
        elif use == "institutional":
            stories = int(rng.integers(1, 8))
        else:
            stories = int(rng.integers(1, 6))

        if rng.random() < 0.1:
            year_built: float | int = np.nan
        else:
            year_built = int(rng.integers(1950, CURRENT_YEAR + 1))

        if pd.isna(year_built) or int(year_built) >= 2000:
            mat = rng.choice(MATERIALS, p=[0.72, 0.08, 0.20])
        elif int(year_built) >= 1980:
            mat = rng.choice(MATERIALS, p=[0.55, 0.15, 0.30])
        else:
            mat = rng.choice(MATERIALS, p=[0.35, 0.35, 0.30])

        if mat == "wood":
            struct = rng.choice(["wood_frame", "unknown", "braced_frame"], p=[0.65, 0.25, 0.10])
        elif mat == "concrete":
            struct = rng.choice(["shear_wall", "moment_frame", "unknown", "braced_frame"], p=[0.35, 0.30, 0.20, 0.15])
        else:
            struct = rng.choice(STRUCTURAL, p=[0.25, 0.25, 0.15, 0.15, 0.20])

        soil = soil_nehrp[i]

        if stories >= 4 and soil in ("D", "E", "F"):
            foundation = rng.choice(FOUNDATIONS, p=[0.35, 0.35, 0.22, 0.08])
        else:
            foundation = rng.choice(FOUNDATIONS, p=[0.55, 0.15, 0.18, 0.12])

        retrofit = bool(
            rng.random() < (0.06 + (0.12 if use == "institutional" else 0.0) + (0.05 if stories >= 5 else 0.0))
        )

        rows.append({
            "distance_to_fault_km": float(distance_to_fault_km[i]),
            "elevation_m": float(elevations[i]),
            "year_built": year_built,
            "number_of_stories": stories,
            "building_use": use,
            "soil_classification": soil,
            "previous_retrofit": retrofit,
            "structural_system": struct,
            "foundation_type": foundation,
            "material": mat,
        })
    return pd.DataFrame(rows)


# ==================== Vulnerability score ====================

def vulnerability_score(row: pd.Series) -> float:
    age = CURRENT_YEAR - int(row["year_built"]) if pd.notna(row["year_built"]) else 45.0
    age = max(0.0, min(age, 120.0))
    stories = float(row["number_of_stories"])
    dist = float(row["distance_to_fault_km"])
    elev = float(row["elevation_m"]) if pd.notna(row.get("elevation_m")) else 50.0
    slope = float(row["slope_deg"]) if pd.notna(row.get("slope_deg")) else 3.0
    fault_prox = max(0.0, (40.0 - dist) / 40.0) * 0.50
    # Low elevation = higher flood/liquefaction risk; high slope = landslide risk
    elev_risk = max(0.0, (100.0 - elev) / 100.0) * 0.12
    slope_risk = min(slope, 30.0) / 30.0 * 0.10
    retrofit = bool(row["previous_retrofit"])
    r = (
        (age / 100.0) * 0.38
        + min(stories, 20) / 20.0 * 0.25
        + _soil_weight(str(row["soil_classification"]))
        + fault_prox
        + elev_risk
        + slope_risk
        + _use_weight(str(row["building_use"]))
        + _material_weight(str(row["material"]))
        + _structural_weight(str(row["structural_system"]))
        + _foundation_weight(str(row["foundation_type"]))
    )
    if retrofit:
        r -= 0.20
    return float(np.clip(r, 0.0, 1.8))


def labels_pre(scores: np.ndarray) -> list[str]:
    q1, q2 = np.quantile(scores, [1 / 3, 2 / 3])
    return ["low" if s <= q1 else ("moderate" if s <= q2 else "high") for s in scores]


def labels_post(scores: np.ndarray) -> list[str]:
    q1, q2 = np.quantile(scores, [1 / 3, 2 / 3])
    return ["SAFE" if s <= q1 else ("RESTRICTED" if s <= q2 else "UNSAFE") for s in scores]


# ==================== main ====================

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic building rows with real GIS features (San Jose del Monte, Bulacan)."
    )
    parser.add_argument("--gis-data-dir", type=Path, default=None)
    parser.add_argument("--fault-shp", type=Path, default=None)
    parser.add_argument("--no-liquefaction-overlay", action="store_true")
    parser.add_argument("--boundary", "--caloocan-boundary", type=Path, default=None, dest="boundary", metavar="PATH")
    parser.add_argument("--nominatim-query", type=str, default=DEFAULT_STUDY_AREA_NOMINATIM_QUERY)
    parser.add_argument("--n", type=int, default=5000)
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).resolve().parent.parent / "data")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    ml_root = Path(__file__).resolve().parent.parent
    gis_data_dir = args.gis_data_dir or default_gis_data_dir(ml_root)
    fault_path = args.fault_shp or (gis_data_dir / SUBDIR_VFS / DEFAULT_FAULT_BASENAME)

    rng = np.random.default_rng(args.seed)

    # --- SRTM DEM ---
    srtm_cache = ml_root / "data" / "gis" / "srtm"
    hgt_path = download_srtm_tile(srtm_cache)
    dem = load_srtm_array(hgt_path)
    slope_arr = compute_slope_from_dem(dem)
    print(f"Loaded SRTM DEM ({dem.shape}), computed slope grid.", file=sys.stderr)

    # --- Fault lines ---
    print(f"Loading Valley Fault System (PHIVOLCS): {fault_path}", file=sys.stderr)
    faults = load_fault_lines(fault_path)

    # --- Liquefaction ---
    liq: gpd.GeoDataFrame | None = None
    if not args.no_liquefaction_overlay:
        print(f"Loading liquefaction bulletin polygons from {gis_data_dir / SUBDIR_LIQ}", file=sys.stderr)
        liq = load_phivolcs_liquefaction_polygons(gis_data_dir)
        if liq is None:
            print("Warning: no liquefaction layers loaded.", file=sys.stderr)

    # --- Study area boundary ---
    nominatim_used: str | None = None
    if args.boundary is not None:
        print(f"Loading study area boundary: {args.boundary}", file=sys.stderr)
        study_area = load_boundary_vector(args.boundary)
    else:
        nominatim_used = args.nominatim_query
        print(f"Fetching study area boundary from Nominatim: {nominatim_used!r}...", file=sys.stderr)
        study_area = fetch_study_area_boundary_from_nominatim(nominatim_used)

    # --- Random building points ---
    poly = primary_polygon(study_area)
    lon, lat = random_points_in_polygon(poly, args.n, rng)

    # --- Elevation + slope from SRTM ---
    print(f"Sampling elevation and slope for {args.n} points...", file=sys.stderr)
    elevations = sample_elevation(lat, lon, dem)
    slopes = sample_slope(lat, lon, slope_arr)

    # --- Soil from SJDM soil map (elevation-based zones) ---
    print("Assigning soil_classification from SJDM soil map zones...", file=sys.stderr)
    soil_pairs = assign_soil_from_elevation(elevations, rng)
    soil_names = [p[0] for p in soil_pairs]
    soil_nehrp = [p[1] for p in soil_pairs]

    # --- Fault distance ---
    print(f"Computing nearest fault distance for {args.n} points (CRS {PROJECTED_CRS})...", file=sys.stderr)
    dist_km = nearest_fault_distance_km(lon, lat, faults)

    # --- Synthesize other attributes ---
    print("Synthesizing FEMA P-154-inspired attributes...", file=sys.stderr)
    base = fema_p154_sample_attributes(args.n, dist_km, elevations, soil_nehrp, rng)
    base["longitude"] = lon
    base["latitude"] = lat
    base["slope_deg"] = slopes
    base["sjdm_soil_name"] = soil_names
    base["building_age"] = base["year_built"].apply(
        lambda y: CURRENT_YEAR - int(y) if pd.notna(y) else np.nan
    )

    # --- Liquefaction override (if polygons cover the area) ---
    liq_tiers: list[str | None] = [None] * args.n
    if liq is not None and not liq.empty:
        liq_tiers = point_liquefaction_tiers(lon, lat, liq)
        applied = 0
        for i, tier in enumerate(liq_tiers):
            if tier is not None:
                base.loc[i, "soil_classification"] = LIQ_TIER_TO_SOIL[tier]
                applied += 1
        print(f"Applied PHIVOLCS liquefaction soil override on {applied} / {args.n} points.", file=sys.stderr)
    base["liquefaction_tier"] = [t if t is not None else "" for t in liq_tiers]

    # --- Labels ---
    scores = base.apply(vulnerability_score, axis=1).to_numpy()
    base["label"] = labels_pre(scores)
    base["assessed_damage"] = base["label"]
    pre_df = base.copy()

    post_df = base.copy()
    post_df["label"] = labels_post(scores)
    post_df["assessed_damage"] = post_df["label"]

    # --- Write ---
    args.out_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "n_buildings": args.n,
        "gis_data_dir": str(gis_data_dir.resolve()),
        "fault_shp": str(fault_path.resolve()),
        "srtm_tile": SRTM_TILE_NAME,
        "srtm_source": SRTM_TILE_URL,
        "sjdm_soil_zones": SJDM_SOIL_ZONES,
        "liquefaction_dir": str((gis_data_dir / SUBDIR_LIQ).resolve()),
        "liquefaction_overlay": not args.no_liquefaction_overlay,
        "study_area": "San Jose del Monte, Bulacan, Philippines",
        "study_area_boundary": str(args.boundary.resolve()) if args.boundary else (f"nominatim:{nominatim_used}" if nominatim_used else None),
        "projected_crs": PROJECTED_CRS,
        "seed": args.seed,
    }
    (args.out_dir / "generation_meta.json").write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

    ordered = [
        "latitude", "longitude",
        "distance_to_fault_km", "elevation_m", "slope_deg",
        "sjdm_soil_name", "liquefaction_tier",
        "year_built", "building_age", "number_of_stories",
        "material", "building_use", "soil_classification",
        "previous_retrofit", "structural_system", "foundation_type",
        "label", "assessed_damage",
    ]
    pre_path = args.out_dir / "train_pre.csv"
    post_path = args.out_dir / "train_post.csv"
    pre_df[ordered].to_csv(pre_path, index=False)
    post_df[ordered].to_csv(post_path, index=False)

    print(f"\nWrote {pre_path} ({len(pre_df)} rows)")
    print(f"Wrote {post_path} ({len(post_df)} rows)")
    print(f"Wrote {args.out_dir / 'generation_meta.json'}")
    print("Pre label counts:\n", pre_df["label"].value_counts())
    print("Post label counts:\n", post_df["label"].value_counts())
    print(f"distance_to_fault_km: {pre_df['distance_to_fault_km'].describe()}")
    print(f"elevation_m: {pre_df['elevation_m'].describe()}")
    print(f"slope_deg: {pre_df['slope_deg'].describe()}")
    print(f"soil_classification: {pre_df['soil_classification'].value_counts().to_dict()}")
    print(f"sjdm_soil_name: {pre_df['sjdm_soil_name'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
