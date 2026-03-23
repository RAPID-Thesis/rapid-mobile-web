"""
Semi-synthetic tabular rows for RF training.

- Loads real active fault lines from a government .shp via geopandas.
- Draws random building locations strictly inside the study area polygon (default: San Jose del Monte, Bulacan via OSM Nominatim or GeoJSON).
- Computes shortest distance from each point to the nearest fault segment (geodesically via projected CRS).
- Synthesizes remaining attributes using FEMA P-154–inspired rules (age, material, stories, etc.).
- Assigns pre-EQ labels (low/moderate/high) and post-EQ triage labels (SAFE/RESTRICTED/UNSAFE) via score tertiles.

Usage:
  pip install -r requirements.txt
  python scripts/generate_synthetic_data.py --n 5000

Default GIS inputs (project layout):
  ml/data/gis/data/H_VFS_PHIVOLCS/H_VFS_ALL_PHIVOLCS_PL.shp  — Valley Fault System (line layer) for distance_to_fault_km
  ml/data/gis/data/H_LIQ_PHIVOLCS_BUL/H_LIQ_{LOW,MOD,HIGH}_PHIVOLCS.shp — liquefaction hazard polygons (optional soil override)

Environment:
  NOMINATIM_USER_AGENT  optional override for OSM Nominatim User-Agent (default: RAPID-Thesis/1.0).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from shapely.geometry import Point, shape

RNG = np.random.default_rng(42)

# Metro Manila distances: UTM zone 51N (meters).
PROJECTED_CRS = "EPSG:32651"

BUILDING_USES = [
    "residential",
    "commercial",
    "institutional",
    "industrial",
    "mixed",
]
SOILS = ["A", "B", "C", "D", "E", "F"]
STRUCTURAL = [
    "moment_frame",
    "shear_wall",
    "braced_frame",
    "wood_frame",
    "unknown",
]
FOUNDATIONS = ["shallow", "deep", "mat", "unknown"]
MATERIALS = ["concrete", "wood", "mixed"]

CURRENT_YEAR = 2026

# Government GIS layout under ml/data/gis/data/ (two PHIVOLCS product folders).
SUBDIR_VFS = "H_VFS_PHIVOLCS"
SUBDIR_LIQ = "H_LIQ_PHIVOLCS_BUL"
DEFAULT_FAULT_BASENAME = "H_VFS_ALL_PHIVOLCS_PL.shp"

# Map PHIVOLCS liquefaction bulletin class → NEHRP-style site class for the tabular model.
LIQ_TIER_TO_SOIL = {"LOW": "C", "MOD": "D", "HIGH": "E"}

# Default building scatter: San Jose del Monte, Bulacan (not Metro Manila LGU boundaries).
DEFAULT_STUDY_AREA_NOMINATIM_QUERY = "San Jose del Monte, Bulacan, Philippines"


def default_gis_data_dir(ml_root: Path) -> Path:
    return ml_root / "data" / "gis" / "data"


def default_valley_fault_shp(ml_root: Path) -> Path:
    return default_gis_data_dir(ml_root) / SUBDIR_VFS / DEFAULT_FAULT_BASENAME


def _soil_weight(soil: str) -> float:
    return {"A": 0.0, "B": 0.08, "C": 0.18, "D": 0.32, "E": 0.48, "F": 0.62}[soil]


def _use_weight(use: str) -> float:
    return {
        "residential": 0.05,
        "commercial": 0.12,
        "institutional": 0.18,
        "industrial": 0.1,
        "mixed": 0.14,
    }[use]


def _material_weight(mat: str) -> float:
    return {"concrete": 0.0, "mixed": 0.12, "wood": 0.22}[mat]


def _structural_weight(sys: str) -> float:
    return {
        "shear_wall": 0.05,
        "moment_frame": 0.1,
        "braced_frame": 0.12,
        "wood_frame": 0.28,
        "unknown": 0.2,
    }[sys]


def _foundation_weight(ft: str) -> float:
    return {"deep": 0.04, "mat": 0.06, "shallow": 0.14, "unknown": 0.18}[ft]


def load_fault_lines(shp_path: Path) -> gpd.GeoDataFrame:
    if not shp_path.is_file():
        raise FileNotFoundError(f"Fault shapefile not found: {shp_path}")
    gdf = gpd.read_file(shp_path)
    if gdf.empty:
        raise ValueError("Fault GeoDataFrame is empty.")
    if gdf.crs is None:
        raise ValueError(
            "Fault layer has no CRS. Add a .prj or set crs when loading the shapefile."
        )
    gdf = gdf.explode(index_parts=False).reset_index(drop=True)
    # Nearest-distance: keep lineal geometries only (Valley Fault System is polyline).
    gdf = gdf[
        gdf.geometry.geom_type.isin(["LineString", "MultiLineString"])
        & gdf.geometry.notna()
    ].copy()
    if gdf.empty:
        raise ValueError(
            "Fault layer has no line geometries after filtering. Check the shapefile content."
        )
    return gdf


def load_phivolcs_liquefaction_polygons(gis_data_dir: Path) -> gpd.GeoDataFrame | None:
    """
    Load PHIVOLCS liquefaction bulletin polygons (LOW / MOD / HIGH) from the
    H_LIQ_PHIVOLCS_BUL folder. Used to override soil_classification when a building
    point falls inside a hazard polygon (highest tier wins if overlapping).
    """
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
    """Per-point liquefaction tier inside bulletin polygons; None if outside all polygons."""
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


def fetch_study_area_boundary_from_nominatim(query: str) -> gpd.GeoDataFrame:
    """Download study-area polygon from OpenStreetMap Nominatim (requires network)."""
    ua = os.environ.get("NOMINATIM_USER_AGENT", "RAPID-Thesis/1.0 (tabular-data-generator)")
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "json",
        "polygon_geojson": 1,
        "limit": 1,
    }
    headers = {"User-Agent": ua}
    r = requests.get(url, params=params, headers=headers, timeout=120)
    r.raise_for_status()
    data = r.json()
    if not data:
        raise RuntimeError(
            "Nominatim returned no polygon. Save a GeoJSON boundary and pass --boundary."
        )
    first = data[0]
    geo = first.get("geojson")
    if geo is None:
        raise RuntimeError(
            "Nominatim returned no polygon. Save a GeoJSON boundary and pass --boundary."
        )
    geom = shape(geo)
    gdf = gpd.GeoDataFrame(geometry=[geom], crs="EPSG:4326")
    return gdf


def load_boundary_vector(path: Path) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        gdf.set_crs("EPSG:4326", inplace=True)
    return gdf


def primary_polygon(gdf: gpd.GeoDataFrame):
    """Single polygon for point-in-polygon sampling (largest if MultiPolygon)."""
    s = gdf.geometry
    if hasattr(s, "union_all"):
        geom = s.union_all()
    else:
        geom = s.unary_union
    if geom.geom_type == "MultiPolygon":
        return max(geom.geoms, key=lambda p: p.area)
    if geom.geom_type == "Polygon":
        return geom
    raise ValueError(f"Unsupported boundary geometry: {geom.geom_type}")


def random_points_in_polygon(
    poly, n: int, rng: np.random.Generator
) -> tuple[list[float], list[float]]:
    """Rejection sampling of WGS84 lon/lat inside polygon (assumed EPSG:4326)."""
    minx, miny, maxx, maxy = poly.bounds
    lons: list[float] = []
    lats: list[float] = []
    while len(lons) < n:
        x = float(rng.uniform(minx, maxx))
        y = float(rng.uniform(miny, maxy))
        p = Point(x, y)
        if poly.contains(p):
            lons.append(x)
            lats.append(y)
    return lons, lats


def nearest_fault_distance_km(
    lon: list[float],
    lat: list[float],
    faults: gpd.GeoDataFrame,
) -> np.ndarray:
    """Shortest planar distance in meters (UTM), returned as km."""
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
        raise RuntimeError(f"sjoin_nearest missed {len(missing)} points (fault layer issue).")
    dist_m = joined["dist_m"].reindex(pts_p.index)
    return (dist_m.to_numpy(dtype=np.float64) / 1000.0).astype(np.float64)


def fema_p154_sample_attributes(
    n: int,
    distance_to_fault_km: np.ndarray,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """
    FEMA P-154–inspired stochastic rules (screening context, not literal structural analysis):

    - Building use drives typical height ranges (vertical irregularity proxy).
    - Older construction and non-ductile proxies increase vulnerability weights.
    - Materials skew toward wood/mixed for older eras; concrete for newer stock.
    - Urban Luzon soils: weight toward softer NEHRP classes (C–E).
    """
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

        # Age: older stock more common in screening datasets; clip 1950–current
        if rng.random() < 0.1:
            year_built: float | int = np.nan
            age_proxy = 45.0
        else:
            year_built = int(rng.integers(1950, CURRENT_YEAR + 1))
            age_proxy = float(CURRENT_YEAR - year_built)

        # Material vs era (P-154 typology proxy)
        if pd.isna(year_built) or int(year_built) >= 2000:
            mat = rng.choice(MATERIALS, p=[0.72, 0.08, 0.20])
        elif int(year_built) >= 1980:
            mat = rng.choice(MATERIALS, p=[0.55, 0.15, 0.30])
        else:
            mat = rng.choice(MATERIALS, p=[0.35, 0.35, 0.30])

        if mat == "wood":
            struct = rng.choice(
                ["wood_frame", "unknown", "braced_frame"], p=[0.65, 0.25, 0.10]
            )
        elif mat == "concrete":
            struct = rng.choice(
                ["shear_wall", "moment_frame", "unknown", "braced_frame"],
                p=[0.35, 0.30, 0.20, 0.15],
            )
        else:
            struct = rng.choice(STRUCTURAL, p=[0.25, 0.25, 0.15, 0.15, 0.20])

        # Soft soils more frequent in alluvial urban settings (Greater Manila / Central Luzon proxy).
        soil = rng.choice(SOILS, p=[0.05, 0.10, 0.18, 0.30, 0.25, 0.12])

        if stories >= 4 and soil in ("D", "E", "F"):
            foundation = rng.choice(FOUNDATIONS, p=[0.35, 0.35, 0.22, 0.08])
        else:
            foundation = rng.choice(FOUNDATIONS, p=[0.55, 0.15, 0.18, 0.12])

        retrofit = bool(
            rng.random()
            < (0.06 + (0.12 if use == "institutional" else 0.0) + (0.05 if stories >= 5 else 0.0))
        )

        rows.append(
            {
                "distance_to_fault_km": float(distance_to_fault_km[i]),
                "year_built": year_built,
                "number_of_stories": stories,
                "building_use": use,
                "soil_classification": soil,
                "previous_retrofit": retrofit,
                "structural_system": struct,
                "foundation_type": foundation,
                "material": mat,
            }
        )
    return pd.DataFrame(rows)


def vulnerability_score(row: pd.Series) -> float:
    """Higher = more vulnerable (pre-EQ) / worse post-EQ triage proxy."""
    age = (
        CURRENT_YEAR - int(row["year_built"])
        if pd.notna(row["year_built"])
        else 45.0
    )
    age = max(0.0, min(age, 120.0))
    stories = float(row["number_of_stories"])
    dist = float(row["distance_to_fault_km"])
    fault_prox = max(0.0, (40.0 - dist) / 40.0) * 0.55
    retrofit = bool(row["previous_retrofit"])
    r = (
        (age / 100.0) * 0.42
        + min(stories, 20) / 20.0 * 0.28
        + _soil_weight(str(row["soil_classification"]))
        + fault_prox
        + _use_weight(str(row["building_use"]))
        + _material_weight(str(row["material"]))
        + _structural_weight(str(row["structural_system"]))
        + _foundation_weight(str(row["foundation_type"]))
    )
    if retrofit:
        r -= 0.22
    return float(np.clip(r, 0.0, 1.5))


def labels_pre(scores: np.ndarray) -> list[str]:
    q1, q2 = np.quantile(scores, [1 / 3, 2 / 3])
    out = []
    for s in scores:
        if s <= q1:
            out.append("low")
        elif s <= q2:
            out.append("moderate")
        else:
            out.append("high")
    return out


def labels_post(scores: np.ndarray) -> list[str]:
    q1, q2 = np.quantile(scores, [1 / 3, 2 / 3])
    out = []
    for s in scores:
        if s <= q1:
            out.append("SAFE")
        elif s <= q2:
            out.append("RESTRICTED")
        else:
            out.append("UNSAFE")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic building rows with real fault-line distances (San Jose del Monte, Bulacan study area)."
    )
    parser.add_argument(
        "--gis-data-dir",
        type=Path,
        default=None,
        help="Folder that contains H_VFS_PHIVOLCS and H_LIQ_PHIVOLCS_BUL. "
        "Default: <ml>/data/gis/data",
    )
    parser.add_argument(
        "--fault-shp",
        type=Path,
        default=None,
        help="Override path to Valley Fault / fault line .shp. "
        "Default: <gis-data-dir>/H_VFS_PHIVOLCS/H_VFS_ALL_PHIVOLCS_PL.shp",
    )
    parser.add_argument(
        "--no-liquefaction-overlay",
        action="store_true",
        help="Do not load PHIVOLCS liquefaction polygons for soil_classification override.",
    )
    parser.add_argument(
        "--boundary",
        "--caloocan-boundary",
        type=Path,
        default=None,
        dest="boundary",
        metavar="PATH",
        help="GeoJSON/GeoPackage of study area (San Jose del Monte). If omitted, downloads via Nominatim.",
    )
    parser.add_argument(
        "--nominatim-query",
        type=str,
        default=DEFAULT_STUDY_AREA_NOMINATIM_QUERY,
        help=f"Nominatim search string when --boundary is omitted (default: {DEFAULT_STUDY_AREA_NOMINATIM_QUERY!r}).",
    )
    parser.add_argument(
        "--n",
        type=int,
        default=5000,
        help="Number of synthetic buildings (default 5000).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "data",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="RNG seed for reproducible synthesis.",
    )
    args = parser.parse_args()
    ml_root = Path(__file__).resolve().parent.parent
    gis_data_dir = args.gis_data_dir or default_gis_data_dir(ml_root)
    fault_path = args.fault_shp or (gis_data_dir / SUBDIR_VFS / DEFAULT_FAULT_BASENAME)

    rng = np.random.default_rng(args.seed)

    print(f"Loading Valley Fault System (PHIVOLCS): {fault_path}", file=sys.stderr)
    faults = load_fault_lines(fault_path)

    liq: gpd.GeoDataFrame | None = None
    if not args.no_liquefaction_overlay:
        print(f"Loading liquefaction bulletin polygons from {gis_data_dir / SUBDIR_LIQ}", file=sys.stderr)
        liq = load_phivolcs_liquefaction_polygons(gis_data_dir)
        if liq is None:
            print(
                "Warning: no liquefaction layers loaded; soil_classification is fully synthetic.",
                file=sys.stderr,
            )

    nominatim_used: str | None = None
    if args.boundary is not None:
        print(f"Loading study area boundary: {args.boundary}", file=sys.stderr)
        study_area = load_boundary_vector(args.boundary)
    else:
        nominatim_used = args.nominatim_query
        print(
            f"Fetching study area boundary from Nominatim (requires network): {nominatim_used!r}...",
            file=sys.stderr,
        )
        study_area = fetch_study_area_boundary_from_nominatim(nominatim_used)

    poly = primary_polygon(study_area)
    lon, lat = random_points_in_polygon(poly, args.n, rng)
    print(
        f"Computing nearest fault distance for {args.n} points (CRS {PROJECTED_CRS})...",
        file=sys.stderr,
    )
    dist_km = nearest_fault_distance_km(lon, lat, faults)

    print("Synthesizing FEMA P-154-inspired attributes...", file=sys.stderr)
    base = fema_p154_sample_attributes(args.n, dist_km, rng)
    base["longitude"] = lon
    base["latitude"] = lat

    liq_tiers: list[str | None] = [None] * args.n
    if liq is not None and not liq.empty:
        liq_tiers = point_liquefaction_tiers(lon, lat, liq)
        applied = 0
        for i, tier in enumerate(liq_tiers):
            if tier is not None:
                base.loc[i, "soil_classification"] = LIQ_TIER_TO_SOIL[tier]
                applied += 1
        base["liquefaction_tier"] = [t if t is not None else "" for t in liq_tiers]
        print(
            f"Applied PHIVOLCS liquefaction soil override on {applied} / {args.n} points.",
            file=sys.stderr,
        )
    else:
        base["liquefaction_tier"] = ""

    scores = base.apply(vulnerability_score, axis=1).to_numpy()
    pre_labels = labels_pre(scores)
    post_labels = labels_post(scores)

    base["label"] = pre_labels
    base["assessed_damage"] = pre_labels  # pre-EQ: screening tier proxy (not literal damage)

    pre_df = base.copy()

    post_df = base.copy()
    post_df["label"] = post_labels
    post_df["assessed_damage"] = post_labels

    args.out_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "n_buildings": args.n,
        "gis_data_dir": str(gis_data_dir.resolve()),
        "fault_shp": str(fault_path.resolve()),
        "liquefaction_dir": str((gis_data_dir / SUBDIR_LIQ).resolve()),
        "liquefaction_overlay": not args.no_liquefaction_overlay,
        "liq_tier_to_soil_classification": LIQ_TIER_TO_SOIL,
        "study_area": "San Jose del Monte, Bulacan, Philippines",
        "study_area_boundary": str(args.boundary.resolve())
        if args.boundary
        else (f"nominatim:{nominatim_used}" if nominatim_used else None),
        "nominatim_query": nominatim_used,
        "projected_crs": PROJECTED_CRS,
        "distance_column": "distance_to_fault_km",
        "seed": args.seed,
        "note": "distance_to_fault_km is nearest planar distance in projected CRS (km) to H_VFS_ALL_PHIVOLCS_PL.",
    }
    (args.out_dir / "generation_meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )

    # Column order: geo + key engineering fields + targets
    ordered = [
        "latitude",
        "longitude",
        "distance_to_fault_km",
        "liquefaction_tier",
        "year_built",
        "number_of_stories",
        "material",
        "building_use",
        "soil_classification",
        "previous_retrofit",
        "structural_system",
        "foundation_type",
        "label",
        "assessed_damage",
    ]
    pre_path = args.out_dir / "train_pre.csv"
    post_path = args.out_dir / "train_post.csv"
    pre_df[ordered].to_csv(pre_path, index=False)
    post_df[ordered].to_csv(post_path, index=False)

    print(f"Wrote {pre_path} ({len(pre_df)} rows)")
    print(f"Wrote {post_path} ({len(post_df)} rows)")
    print(f"Wrote {args.out_dir / 'generation_meta.json'}")
    print("Pre label counts:\n", pre_df["label"].value_counts())
    print("Post label counts:\n", post_df["label"].value_counts())
    print(
        "distance_to_fault_km summary (km):\n",
        pre_df["distance_to_fault_km"].describe(),
    )


if __name__ == "__main__":
    main()
