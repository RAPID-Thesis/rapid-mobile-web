#!/usr/bin/env python3
"""
Export compact SJDM geo bundle for offline tabular feature enrichment.

  python ml/scripts/export_mobile_geo.py
  python ml/scripts/export_mobile_geo.py --copy-to-mobile

Writes ml/artifacts/mobile/sjdm_geo.json (and copies to mobile/assets/geo/).
Uses SRTM N14E121 tile + PHIVOLCS fault shapefile when available; otherwise
emits a coarse fallback grid for San Jose del Monte.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml"
MOBILE_OUT = ML_ROOT / "artifacts" / "mobile"
MOBILE_GEO = REPO_ROOT / "mobile" / "assets" / "geo"

# SJDM approximate bounds
LAT_MIN, LAT_MAX = 14.72, 14.92
LON_MIN, LON_MAX = 120.98, 121.12
GRID_STEP = 0.01  # ~1.1 km

# Fault segments are kept if within this many degrees of the study bounds (~55 km). The
# vulnerability score saturates at 40 km, so this preserves exact distances for every point
# in the area while keeping the bundle small.
FAULT_MARGIN_DEG = 0.5

SRTM_LAT, SRTM_LON = 14, 121
SRTM_SAMPLES = 3601


def _sample_srtm(dem, slope_arr, lat: float, lon: float) -> tuple[float | None, float | None]:
    import numpy as np

    if dem is None:
        return None, None
    if not (SRTM_LAT <= lat < SRTM_LAT + 1 and SRTM_LON <= lon < SRTM_LON + 1):
        return None, None
    row = int(round((SRTM_LAT + 1 - lat) * (SRTM_SAMPLES - 1)))
    col = int(round((lon - SRTM_LON) * (SRTM_SAMPLES - 1)))
    row = max(0, min(SRTM_SAMPLES - 1, row))
    col = max(0, min(SRTM_SAMPLES - 1, col))
    elev = float(dem[row, col])
    slp = float(slope_arr[row, col])
    if not math.isfinite(elev) or not math.isfinite(slp):
        return None, None
    return elev, slp


def _load_dem():
    import gzip
    from io import BytesIO

    import numpy as np

    srtm_dir = ML_ROOT / "data" / "gis" / "srtm"
    hgt = srtm_dir / "N14E121.hgt"
    if not hgt.exists():
        gz_url_path = srtm_dir / "N14E121.hgt.gz"
        if not gz_url_path.exists():
            try:
                import urllib.request

                srtm_dir.mkdir(parents=True, exist_ok=True)
                url = "https://elevation-tiles-prod.s3.amazonaws.com/skadi/N14/N14E121.hgt.gz"
                print(f"Downloading SRTM {url}...", file=sys.stderr)
                with urllib.request.urlopen(url, timeout=60) as resp:
                    gz_bytes = resp.read()
                with gzip.open(BytesIO(gz_bytes)) as src, open(hgt, "wb") as dst:
                    dst.write(src.read())
            except Exception as exc:
                print(f"SRTM unavailable ({exc}); using fallback elevations.", file=sys.stderr)
                return None, None

    if not hgt.exists():
        return None, None

    dem = np.fromfile(hgt, dtype=">i2").reshape(SRTM_SAMPLES, SRTM_SAMPLES).astype(np.float32)
    dem[dem == -32768] = np.nan
    dz_dy, dz_dx = np.gradient(dem, 30.0)
    slope = np.degrees(np.arctan(np.sqrt(dz_dx**2 + dz_dy**2)))
    return dem, slope


def _intersects_bounds(segment: list[list[float]], margin: float) -> bool:
    """True if the segment's bounding box overlaps the study area expanded by ``margin`` degrees."""
    lons = [p[0] for p in segment]
    lats = [p[1] for p in segment]
    return not (
        max(lons) < LON_MIN - margin
        or min(lons) > LON_MAX + margin
        or max(lats) < LAT_MIN - margin
        or min(lats) > LAT_MAX + margin
    )


def _load_fault_segments() -> list[list[list[float]]]:
    fault_shp = (
        ML_ROOT
        / "data"
        / "gis"
        / "data"
        / "H_VFS_PHIVOLCS"
        / "H_VFS_ALL_PHIVOLCS_PL.shp"
    )
    if not fault_shp.exists():
        # Approximate West Valley Fault segment near SJDM (lon, lat pairs)
        return [
            [[120.99, 14.75], [121.05, 14.82], [121.08, 14.88]],
            [[121.02, 14.78], [121.06, 14.85]],
        ]

    try:
        import geopandas as gpd

        gdf = gpd.read_file(fault_shp).to_crs("EPSG:4326")
        segments: list[list[list[float]]] = []
        for geom in gdf.geometry:
            if geom is None or geom.is_empty:
                continue
            if geom.geom_type == "LineString":
                coords = [[float(x), float(y)] for x, y in geom.coords]
                segments.append(coords)
            elif geom.geom_type == "MultiLineString":
                for part in geom.geoms:
                    segments.append([[float(x), float(y)] for x, y in part.coords])

        # Keep the segments that can actually be nearest to a point in the study area rather
        # than an arbitrary first-N slice. The vulnerability score saturates at 40 km, so a
        # ~0.5 deg (~55 km) margin around the bounds is more than sufficient and still yields
        # distances identical to using the full shapefile.
        total = len(segments)
        segments = [s for s in segments if _intersects_bounds(s, FAULT_MARGIN_DEG)]
        print(f"Fault segments: kept {len(segments)} of {total} "
              f"(within {FAULT_MARGIN_DEG} deg of study bounds)", file=sys.stderr)
        return segments
    except Exception as exc:
        print(f"Fault shapefile load failed ({exc}); using fallback polyline.", file=sys.stderr)
        return [[[120.99, 14.75], [121.05, 14.82], [121.08, 14.88]]]


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0
    p = math.pi / 180.0
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _point_to_segment_km(plon: float, plat: float, a: list[float], b: list[float]) -> float:
    # Project onto segment in local equirectangular approx
    ax, ay = a[0], a[1]
    bx, by = b[0], b[1]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _haversine_km(plon, plat, ax, ay)
    t = max(0.0, min(1.0, ((plon - ax) * dx + (plat - ay) * dy) / (dx * dx + dy * dy)))
    clon = ax + t * dx
    clat = ay + t * dy
    return _haversine_km(plon, plat, clon, clat)


def _nearest_fault_km(lon: float, lat: float, segments: list[list[list[float]]]) -> float:
    best = 999.0
    for seg in segments:
        for i in range(len(seg) - 1):
            d = _point_to_segment_km(lon, lat, seg[i], seg[i + 1])
            best = min(best, d)
    return best if best < 900 else 25.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--copy-to-mobile", action="store_true")
    args = parser.parse_args()

    dem, slope = _load_dem()
    fault_segments = _load_fault_segments()

    grid: list[dict] = []
    lat = LAT_MIN
    while lat <= LAT_MAX + 1e-9:
        lon = LON_MIN
        while lon <= LON_MAX + 1e-9:
            elev, slp = _sample_srtm(dem, slope, lat, lon)
            if elev is None:
                elev = 180.0 + (lat - LAT_MIN) * 120.0
                slp = 2.0 + (lon - LON_MIN) * 8.0
            dist = _nearest_fault_km(lon, lat, fault_segments)
            grid.append(
                {
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "elevation_m": round(elev, 1),
                    "slope_deg": round(slp, 2),
                    "distance_to_fault_km": round(dist, 2),
                }
            )
            lon += GRID_STEP
        lat += GRID_STEP

    bundle = {
        "version": 1,
        "bounds": {"lat_min": LAT_MIN, "lat_max": LAT_MAX, "lon_min": LON_MIN, "lon_max": LON_MAX},
        "grid_step_deg": GRID_STEP,
        "fault_segments": fault_segments,
        "grid": grid,
    }

    MOBILE_OUT.mkdir(parents=True, exist_ok=True)
    out_path = MOBILE_OUT / "sjdm_geo.json"
    out_path.write_text(json.dumps(bundle), encoding="utf-8")
    print(f"Wrote {out_path} ({len(grid)} cells)")

    if args.copy_to_mobile:
        MOBILE_GEO.mkdir(parents=True, exist_ok=True)
        shutil.copy2(out_path, MOBILE_GEO / "sjdm_geo.json")
        print(f"Copied -> {MOBILE_GEO / 'sjdm_geo.json'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
