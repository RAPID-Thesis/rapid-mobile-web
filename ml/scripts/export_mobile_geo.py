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


# ---------------------------------------------------------------------------
# Barangay layer
#
# This is what lets the phone name a location with no network. There is no
# authoritative free source for San Jose del Monte's barangay boundaries:
# OpenStreetMap carries admin_level=10 polygons for exactly two of the ~59
# (San Roque and Sapang Palay Proper), so an Overpass query returns almost
# nothing. Nominatim resolves most of them, but as centre points rather than
# polygons.
#
# So this layer degrades the way the rest of the bundle already does:
#
#   1. a local boundary shapefile, if one is dropped under ml/data/gis/data/
#   2. the cached lookup in ml/data/gis/barangay_centroids.json
#   3. a live Nominatim lookup (--refresh-barangays), which writes that cache
#
# and if none of those yield anything the key is omitted entirely, leaving a
# bundle that v1 readers still understand.
#
# A centroid record is an approximation and consumers must say so: geoLookup.ts
# reports which kind it matched, so the UI can offer a guess to confirm rather
# than assert a boundary the data does not support.

BARANGAY_CACHE = ML_ROOT / "data" / "gis" / "barangay_centroids.json"
BARANGAY_SOURCE_TS = REPO_ROOT / "mobile" / "constants" / "sjdmLocations.ts"

# Tighter than the grid bounds above, which deliberately overshoot into
# Caloocan/QC to give the SRTM sampling margin. A geocoder hit outside this is a
# different place that happens to share a name.
BRGY_LAT_MIN, BRGY_LAT_MAX = 14.748, 14.872
BRGY_LON_MIN, BRGY_LON_MAX = 120.992, 121.088

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim's usage policy: at most one request per second, and identify yourself.
NOMINATIM_DELAY_S = 1.1
NOMINATIM_UA = "RAPID-seismic-assessment/1.0 (thesis project; offline geocoding bundle)"

# A street that merely shares a barangay's name is the common false positive --
# "Sto. Cristo" resolves to a road. Keep place-like results only.
ACCEPTED_CLASSES = {"place", "boundary", "landuse", "administrative"}


def _parse_barangay_names() -> dict[str, list[str]]:
    """Read the district -> barangay map out of the app's own constants file.

    Parsed rather than copied: that list is already the source of truth for the
    wizard's picker, and a second copy here would drift the first time a
    barangay is renamed.
    """
    import re

    text = BARANGAY_SOURCE_TS.read_text(encoding="utf-8")
    block = re.search(r"SJDM_DISTRICTS\s*=\s*\{(.*?)\n\}\s*as const;", text, re.S)
    if not block:
        raise RuntimeError(f"could not find SJDM_DISTRICTS in {BARANGAY_SOURCE_TS}")

    districts: dict[str, list[str]] = {}
    for match in re.finditer(r"'([^']+)':\s*\[(.*?)\]", block.group(1), re.S):
        districts[match.group(1)] = re.findall(r"'([^']+)'", match.group(2))
    if not districts:
        raise RuntimeError(f"parsed no districts from {BARANGAY_SOURCE_TS}")
    return districts


def _within_sjdm(lat: float, lon: float) -> bool:
    return BRGY_LAT_MIN <= lat <= BRGY_LAT_MAX and BRGY_LON_MIN <= lon <= BRGY_LON_MAX


def _simplify_ring(ring: list[list[float]], tolerance: float = 0.0004) -> list[list[float]]:
    """Douglas-Peucker, so a polygon costs tens of points rather than thousands.

    0.0004 deg is roughly 45 m, well inside the error the centroid fallback
    carries anyway, and the phone parses this file on every cold start.
    """
    if len(ring) <= 4:
        return ring

    def perpendicular(point, start, end) -> float:
        ax, ay = start
        bx, by = end
        px, py = point
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
        t = max(0.0, min(1.0, t))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    def reduce(points):
        if len(points) < 3:
            return points
        worst, index = 0.0, 0
        for i in range(1, len(points) - 1):
            d = perpendicular(points[i], points[0], points[-1])
            if d > worst:
                worst, index = d, i
        if worst <= tolerance:
            return [points[0], points[-1]]
        return reduce(points[: index + 1])[:-1] + reduce(points[index:])

    return reduce(ring)


def _load_barangay_shapefile() -> list[dict] | None:
    """Real polygons, if a boundary file has been placed under ml/data/gis/data/."""
    gis_root = ML_ROOT / "data" / "gis" / "data"
    if not gis_root.exists():
        return None

    candidates: list[Path] = []
    for pattern in ("**/*arangay*.shp", "**/*BRGY*.shp", "**/*arangay*.geojson"):
        candidates.extend(gis_root.glob(pattern))
    if not candidates:
        return None

    try:
        import geopandas as gpd

        gdf = gpd.read_file(candidates[0]).to_crs("EPSG:4326")
    except Exception as exc:
        print(f"Barangay file found but unreadable ({exc}); falling back.", file=sys.stderr)
        return None

    name_col = next(
        (c for c in gdf.columns if c.lower() in {"name", "brgy_name", "barangay", "adm4_en"}),
        None,
    )
    if name_col is None:
        print(f"{candidates[0].name} has no name column; falling back.", file=sys.stderr)
        return None

    records: list[dict] = []
    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        # Largest part only: the multi-part cases here are slivers, and the phone
        # runs one point-in-polygon test per barangay.
        largest = max(parts, key=lambda g: g.area)
        ring = _simplify_ring([[float(x), float(y)] for x, y in largest.exterior.coords])
        centroid = largest.centroid
        records.append(
            {
                "name": str(row[name_col]).strip(),
                "lat": round(float(centroid.y), 6),
                "lon": round(float(centroid.x), 6),
                "polygon": [[round(x, 5), round(y, 5)] for x, y in ring],
                "source": "polygon",
            }
        )

    print(f"Barangays: {len(records)} polygons from {candidates[0].name}", file=sys.stderr)
    return records or None


def _query_nominatim(query: str) -> list[dict]:
    """Search, constrained to the study area.

    bounded=1 with a viewbox matters more than it looks: barangay names like
    "San Roque", "San Isidro" and "Sta. Cruz" repeat all over the Philippines,
    and an unbounded limit=1 search returns whichever one Nominatim ranks
    highest -- usually not ours. Several barangays that appeared to be missing
    from the geocoder were really just losing to a namesake in another province.
    """
    import urllib.parse
    import urllib.request

    params = urllib.parse.urlencode(
        {
            "format": "jsonv2",
            "limit": "5",
            "polygon_geojson": "1",
            "bounded": "1",
            "viewbox": f"{BRGY_LON_MIN},{BRGY_LAT_MAX},{BRGY_LON_MAX},{BRGY_LAT_MIN}",
            "q": query,
        }
    )
    request = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}", headers={"User-Agent": NOMINATIM_UA}
    )
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.loads(response.read().decode("utf-8"))


def _name_variants(name: str) -> list[str]:
    """Spellings to try, in order, until the geocoder recognises one.

    The constants file writes these names the way the LGU does, which is not the
    way OSM does. Three mismatches account for nearly every miss:

      - an en dash in "Francisco Homes - Narra"
      - Spanish honorifics abbreviated: Sto. / Sta. for Santo / Santa
      - "Nino" spelled without its tilde

    Each variant costs a second of rate-limited waiting, so they are ordered
    most-likely-first and the loop stops at the first accepted hit.
    """
    variants = [name]

    for dash in ("–", "—"):
        if dash in name:
            variants.append(name.replace(dash, "-"))
            variants.append(" ".join(name.replace(dash, " ").split()))
            variants.append(name.split(dash)[-1].strip())

    expansions = {"Sto.": "Santo", "Sta.": "Santa", "Nino": "Niño"}
    expanded = name
    for short, long in expansions.items():
        expanded = expanded.replace(short, long)
    if expanded != name:
        variants.append(expanded)

    # Roman-numeral suffixes ("Sta. Cruz II") are sometimes recorded as plain
    # digits, and sometimes the section is not mapped separately at all -- in
    # which case the parent barangay's centroid is a better answer than nothing.
    numerals = {"I": "1", "II": "2", "III": "3", "IV": "4", "V": "5"}
    head, _, tail = name.rpartition(" ")
    if head and tail in numerals:
        variants.append(f"{head} {numerals[tail]}")
        for candidate in (expanded, name):
            stem = candidate.rpartition(" ")[0]
            if stem:
                variants.append(stem)

    seen: set[str] = set()
    return [v for v in variants if v and not (v in seen or seen.add(v))]


def _fetch_barangays_from_nominatim(districts: dict[str, list[str]]) -> list[dict]:
    import time

    records: list[dict] = []
    missed: list[str] = []

    for district, names in districts.items():
        for name in names:
            hit = None
            for variant in _name_variants(name):
                query = f"Barangay {variant}, San Jose del Monte, Bulacan, Philippines"
                try:
                    results = _query_nominatim(query)
                except Exception as exc:
                    print(f"  {name}: request failed ({exc})", file=sys.stderr)
                    results = []
                time.sleep(NOMINATIM_DELAY_S)

                # Scan the whole page, not just the top hit: a bounded search can
                # still rank a road or a shop above the place itself.
                for candidate in results:
                    lat, lon = float(candidate["lat"]), float(candidate["lon"])
                    geom_type = (candidate.get("geojson") or {}).get("type", "Point")
                    klass = candidate.get("class") or candidate.get("category") or ""

                    if not _within_sjdm(lat, lon):
                        continue
                    if klass not in ACCEPTED_CLASSES and geom_type not in {
                        "Polygon",
                        "MultiPolygon",
                    }:
                        continue
                    hit = (candidate, lat, lon, geom_type)
                    break
                if hit is not None:
                    hit = (*hit, variant)
                    break

            if hit is None:
                missed.append(name)
                continue

            candidate, lat, lon, geom_type, variant = hit
            record = {
                "name": name,
                "district": district,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "source": "centroid",
            }
            if variant != name:
                # Keep what actually matched, so a wrong-looking centroid can be
                # traced back to the query that produced it.
                record["matched"] = variant
                # A truncation ("Sta. Cruz II" -> "Sta. Cruz") resolves to the
                # parent barangay, so the point is in the right neighbourhood but
                # not the right section. Say so rather than let it pass as exact.
                if len(variant.split()) < len(name.split()):
                    record["approx"] = True
            if geom_type in {"Polygon", "MultiPolygon"}:
                coords = candidate["geojson"]["coordinates"]
                ring = coords[0] if geom_type == "Polygon" else coords[0][0]
                simplified = _simplify_ring([[float(x), float(y)] for x, y in ring])
                record["polygon"] = [[round(x, 5), round(y, 5)] for x, y in simplified]
                record["source"] = "polygon"
            records.append(record)

    total = sum(len(v) for v in districts.values())
    print(f"Barangays: resolved {len(records)} of {total} via Nominatim", file=sys.stderr)
    if missed:
        print(f"  unresolved: {', '.join(missed)}", file=sys.stderr)
    return records


def _load_barangays(refresh: bool) -> list[dict] | None:
    districts = _parse_barangay_names()
    district_of = {name: d for d, names in districts.items() for name in names}

    from_shapefile = _load_barangay_shapefile()
    if from_shapefile:
        for record in from_shapefile:
            record["district"] = district_of.get(record["name"], "")
        return from_shapefile

    if not refresh and BARANGAY_CACHE.is_file():
        cached = json.loads(BARANGAY_CACHE.read_text(encoding="utf-8"))
        print(f"Barangays: {len(cached)} from cache {BARANGAY_CACHE.name}", file=sys.stderr)
        return cached

    if not refresh:
        print(
            "Barangays: no cache and no boundary file. Re-run with --refresh-barangays "
            "(needs network) to build one; omitting the layer for now.",
            file=sys.stderr,
        )
        return None

    records = _fetch_barangays_from_nominatim(districts)
    if records:
        BARANGAY_CACHE.parent.mkdir(parents=True, exist_ok=True)
        BARANGAY_CACHE.write_text(json.dumps(records, indent=1), encoding="utf-8")
        print(f"Cached -> {BARANGAY_CACHE}", file=sys.stderr)
    return records or None


# ---------------------------------------------------------------------------
# Street layer
#
# What lets the phone write a street address with no signal. The barangay layer
# above can only say which barangay a point is in; an inspector still had to
# type the street by hand whenever the phone was offline, which in the field is
# most of the time.
#
# Source: the OpenFreeMap vector tiles the app's map already draws, so an
# offline address names the same street the inspector sees on the map. (OSM's
# Overpass API was the obvious alternative and was down across three mirrors
# when this was written; the tiles are also exactly what ships to the phone.)
# Data (c) OpenStreetMap contributors, ODbL -- the map view carries the
# attribution.
#
# The tiles are protobuf. Rather than add a dependency to ml/ for one layer, a
# minimal Mapbox Vector Tile reader follows; it was checked tile-for-tile
# against the mapbox-vector-tile package when written.

STREET_CACHE = ML_ROOT / "data" / "gis" / "street_names.json"
STREET_TILE_ZOOM = 14  # OpenFreeMap's maximum; street names are complete there
OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet"
STREET_UA = "RAPID-seismic-assessment/1.0 (thesis project; offline street names)"
# Footpaths and tracks rarely carry an address; everything a building fronts does.
STREET_CLASSES_EXCLUDED = {"path", "track"}
# ~5 m. Enough to keep a curve's shape for a nearest-street test, far less data.
STREET_SIMPLIFY_DEG = 0.00005


def _pb_varint(buf: bytes, i: int) -> tuple[int, int]:
    shift = result = 0
    while True:
        b = buf[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, i
        shift += 7


def _pb_fields(buf: bytes):
    """Yield (field_number, wire_type, value) for one protobuf message."""
    i, n = 0, len(buf)
    while i < n:
        key, i = _pb_varint(buf, i)
        field, wire = key >> 3, key & 7
        if wire == 0:
            value, i = _pb_varint(buf, i)
        elif wire == 2:
            length, i = _pb_varint(buf, i)
            value, i = buf[i : i + length], i + length
        elif wire == 1:
            value, i = buf[i : i + 8], i + 8
        elif wire == 5:
            value, i = buf[i : i + 4], i + 4
        else:
            raise ValueError(f"unsupported protobuf wire type {wire}")
        yield field, wire, value


def _pb_packed(buf: bytes) -> list[int]:
    out, i = [], 0
    while i < len(buf):
        value, i = _pb_varint(buf, i)
        out.append(value)
    return out


def _mvt_named_lines(tile: bytes, layer_name: str) -> list[tuple[str, str | None, list[tuple[int, int]], int]]:
    """(name, class, [tile-space (x, y), ...], extent) for each named line in a layer.

    Only what the street layer needs: string values, LineString geometry. y is
    tile-space, pointing down, as the MVT spec defines it.
    """
    import gzip

    if tile[:2] == b"\x1f\x8b":
        tile = gzip.decompress(tile)

    out = []
    for field, _, layer in _pb_fields(tile):
        if field != 3:
            continue
        name = None
        extent = 4096
        keys: list[str] = []
        values: list[str | None] = []
        features: list[bytes] = []
        for f, _, v in _pb_fields(layer):
            if f == 1:
                name = v.decode("utf-8")
            elif f == 2:
                features.append(v)
            elif f == 3:
                keys.append(v.decode("utf-8"))
            elif f == 4:
                s = None
                for vf, _, vv in _pb_fields(v):
                    if vf == 1:
                        s = vv.decode("utf-8")
                values.append(s)
            elif f == 5:
                extent = v
        if name != layer_name:
            continue

        for feature in features:
            tags: list[int] = []
            geom: list[int] = []
            gtype = 0
            for f, _, v in _pb_fields(feature):
                if f == 2:
                    tags = _pb_packed(v)
                elif f == 3:
                    gtype = v
                elif f == 4:
                    geom = _pb_packed(v)
            if gtype != 2:  # LineString
                continue
            props = {keys[tags[k]]: values[tags[k + 1]] for k in range(0, len(tags) - 1, 2)}
            street = props.get("name")
            if not street:
                continue

            # Geometry: MoveTo(1)/LineTo(2) commands with zigzag-encoded deltas.
            x = y = 0
            line: list[tuple[int, int]] = []
            i = 0
            while i < len(geom):
                command, count = geom[i] & 7, geom[i] >> 3
                i += 1
                if command == 1 and line:
                    out.append((street, props.get("class"), line, extent))
                    line = []
                if command in (1, 2):
                    for _ in range(count):
                        dx, dy = geom[i], geom[i + 1]
                        i += 2
                        x += (dx >> 1) ^ -(dx & 1)
                        y += (dy >> 1) ^ -(dy & 1)
                        line.append((x, y))
            if line:
                out.append((street, props.get("class"), line, extent))
    return out


def _tile_to_lonlat(tx: int, ty: int, px: int, py: int, extent: int, z: int) -> tuple[float, float]:
    n = 2**z
    lon = (tx + px / extent) / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (ty + py / extent) / n))))
    return lon, lat


def _fetch_streets() -> list[list]:
    """Named streets over the study area, from the live OpenFreeMap tiles."""
    import urllib.request

    def get(url: str) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": STREET_UA})
        with urllib.request.urlopen(req, timeout=40) as response:
            return response.read()

    template = json.loads(get(OPENFREEMAP_TILEJSON))["tiles"][0]
    z = STREET_TILE_ZOOM
    pad = 0.01
    west, east = BRGY_LON_MIN - pad, BRGY_LON_MAX + pad
    south, north = BRGY_LAT_MIN - pad, BRGY_LAT_MAX + pad

    def tile_x(lon: float) -> int:
        return int((lon + 180) / 360 * 2**z)

    def tile_y(lat: float) -> int:
        return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**z)

    pieces: list[list] = []
    tiles = 0
    for tx in range(tile_x(west), tile_x(east) + 1):
        for ty in range(tile_y(north), tile_y(south) + 1):
            url = template.replace("{z}", str(z)).replace("{x}", str(tx)).replace("{y}", str(ty))
            tiles += 1
            for name, klass, line, extent in _mvt_named_lines(get(url), "transportation_name"):
                if klass in STREET_CLASSES_EXCLUDED:
                    continue
                coords = [list(_tile_to_lonlat(tx, ty, px, py, extent, z)) for px, py in line]
                coords = _simplify_ring(coords, STREET_SIMPLIFY_DEG)
                pieces.append([name, [[round(lon, 5), round(lat, 5)] for lon, lat in coords]])

    print(
        f"Streets: {len(pieces)} pieces, {len({p[0] for p in pieces})} names from {tiles} tiles",
        file=sys.stderr,
    )
    return pieces


def _load_streets(refresh: bool) -> list[list] | None:
    """Cached street pieces, fetching them first if asked (--refresh-streets)."""
    if not refresh and STREET_CACHE.is_file():
        pieces = json.loads(STREET_CACHE.read_text(encoding="utf-8"))
        print(f"Streets: {len(pieces)} pieces from cache {STREET_CACHE.name}", file=sys.stderr)
        return pieces
    if not refresh:
        print(
            "Streets: no cache. Re-run with --refresh-streets (needs network) to build one; "
            "omitting the layer for now.",
            file=sys.stderr,
        )
        return None
    try:
        pieces = _fetch_streets()
    except Exception as exc:
        print(f"Streets: fetch failed ({exc}); omitting the layer.", file=sys.stderr)
        return None
    STREET_CACHE.parent.mkdir(parents=True, exist_ok=True)
    STREET_CACHE.write_text(json.dumps(pieces, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Cached -> {STREET_CACHE}", file=sys.stderr)
    return pieces


def _pack_streets(pieces: list[list]) -> dict:
    """Bundle form: each name stored once, pieces refer to it by index.

    Tile boundaries split one street into many pieces, so storing the name per
    piece would repeat "Quirino Highway" dozens of times in a file the phone
    parses on every cold start.
    """
    names: list[str] = []
    index: dict[str, int] = {}
    packed = []
    for name, coords in pieces:
        if name not in index:
            index[name] = len(names)
            names.append(name)
        packed.append([index[name], coords])
    return {"names": names, "pieces": packed, "source": "OpenStreetMap contributors (ODbL) via OpenFreeMap"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--copy-to-mobile", action="store_true")
    parser.add_argument(
        "--refresh-barangays",
        action="store_true",
        help="re-geocode every barangay through Nominatim (~1 request/second) "
        "and rewrite ml/data/gis/barangay_centroids.json",
    )
    parser.add_argument(
        "--refresh-streets",
        action="store_true",
        help="re-read street names from the OpenFreeMap tiles and rewrite "
        "ml/data/gis/street_names.json",
    )
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

    barangays = _load_barangays(args.refresh_barangays)
    streets = _load_streets(args.refresh_streets)

    # version 2 adds "barangays", version 3 "streets". Both keys are optional --
    # a reader that finds one missing falls back to what the older bundle did.
    bundle = {
        "version": 3,
        "bounds": {"lat_min": LAT_MIN, "lat_max": LAT_MAX, "lon_min": LON_MIN, "lon_max": LON_MAX},
        "grid_step_deg": GRID_STEP,
        "fault_segments": fault_segments,
        "grid": grid,
    }
    if barangays:
        bundle["barangays"] = barangays
    if streets:
        bundle["streets"] = _pack_streets(streets)

    MOBILE_OUT.mkdir(parents=True, exist_ok=True)
    out_path = MOBILE_OUT / "sjdm_geo.json"
    out_path.write_text(json.dumps(bundle), encoding="utf-8")
    summary = f"{len(grid)} cells"
    if barangays:
        polygons = sum(1 for b in barangays if b.get("polygon"))
        summary += f", {len(barangays)} barangays ({polygons} with polygons)"
    if streets:
        summary += f", {len(streets)} street pieces"
    print(f"Wrote {out_path} ({summary})")

    if args.copy_to_mobile:
        MOBILE_GEO.mkdir(parents=True, exist_ok=True)
        shutil.copy2(out_path, MOBILE_GEO / "sjdm_geo.json")
        print(f"Copied -> {MOBILE_GEO / 'sjdm_geo.json'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
