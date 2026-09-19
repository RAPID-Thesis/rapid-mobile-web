import sjdmGeo from '../../assets/geo/sjdm_geo.json';

export interface GeoSample {
  elevation_m: number;
  slope_deg: number;
  distance_to_fault_km: number;
}

interface GeoCell {
  lat: number;
  lon: number;
  elevation_m: number;
  slope_deg: number;
  distance_to_fault_km: number;
}

export interface GeoBarangay {
  name: string;
  district: string;
  lat: number;
  lon: number;
  /** Outer ring as [lon, lat] pairs. Present for the few barangays OSM maps. */
  polygon?: number[][];
  source: 'polygon' | 'centroid';
  /** The geocoder query that matched, when it was not the name verbatim. */
  matched?: string;
  /** Set when the centroid is the parent barangay's, not this section's. */
  approx?: boolean;
}

interface GeoStreets {
  /** Each street name once; pieces refer to it by index. */
  names: string[];
  /** [name index, [[lon, lat], ...]] -- a street is split into pieces at tile edges. */
  pieces: [number, number[][]][];
  source?: string;
}

interface GeoBundle {
  /** 1 = grid + faults. 2 adds `barangays`, 3 adds `streets`; both stay optional. */
  version?: number;
  bounds: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  grid_step_deg: number;
  fault_segments: number[][][];
  grid: GeoCell[];
  barangays?: GeoBarangay[];
  streets?: GeoStreets;
}

const bundle = sjdmGeo as GeoBundle;

function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = 6371;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLon = (lon2 - lon1) * p;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function pointToSegmentKm(
  plon: number,
  plat: number,
  a: number[],
  b: number[]
): number {
  const ax = a[0]!;
  const ay = a[1]!;
  const bx = b[0]!;
  const by = b[1]!;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return haversineKm(plon, plat, ax, ay);
  const t = Math.max(0, Math.min(1, ((plon - ax) * dx + (plat - ay) * dy) / (dx * dx + dy * dy)));
  return haversineKm(plon, plat, ax + t * dx, ay + t * dy);
}

function nearestFaultKm(lon: number, lat: number): number {
  let best = 999;
  for (const seg of bundle.fault_segments) {
    for (let i = 0; i < seg.length - 1; i++) {
      best = Math.min(best, pointToSegmentKm(lon, lat, seg[i]!, seg[i + 1]!));
    }
  }
  return best < 900 ? best : 25;
}

function nearestGridCell(lat: number, lon: number): GeoCell | null {
  if (!bundle.grid.length) return null;
  let best: GeoCell | null = null;
  let bestDist = Infinity;
  for (const cell of bundle.grid) {
    const d = (cell.lat - lat) ** 2 + (cell.lon - lon) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = cell;
    }
  }
  return best;
}

/* ---------------------------------------------------------------------------
   Offline barangay lookup
   ---------------------------------------------------------------------------
   Turning a coordinate into a place name normally means a network round trip.
   expo-location's reverseGeocodeAsync goes to the platform geocoder, which needs
   connectivity on both Android and iOS, so in the field -- which is the whole
   point of this app -- it returns nothing.

   The bundle therefore ships what little authoritative geometry exists. Only a
   handful of SJDM's barangays have boundary polygons in OpenStreetMap; the rest
   are centre points. Those answer different questions, so the result says which
   one it used: a polygon hit is a fact, a nearest-centroid hit is a guess that
   the UI should offer for confirmation rather than fill in silently.
   ------------------------------------------------------------------------- */

export interface BarangayMatch {
  name: string;
  district: string;
  /** 'polygon' = the point is inside the boundary. 'nearest' = closest centre. */
  precision: 'polygon' | 'nearest';
  /** Distance to the barangay's centre, km. Zero-ish for a polygon hit. */
  distanceKm: number;
  /** True when the underlying record is itself approximate (a parent centroid). */
  approximate: boolean;
}

/**
 * Beyond this a nearest-centroid answer is not worth offering.
 *
 * SJDM's barangays average roughly 2 km across, and the centroids are unevenly
 * spaced, so 3 km keeps a plausible neighbour while rejecting a fix that landed
 * outside the city -- where the nearest centroid would still be *some* barangay
 * and naming it would be worse than admitting we do not know.
 */
const MAX_CENTROID_KM = 3;

/** Ray casting on the [lon, lat] ring. */
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Name the barangay containing (or nearest to) a coordinate, with no network.
 *
 * Polygons win over centroids regardless of distance: being inside a boundary is
 * a stronger claim than being near a point.
 */
export function lookupBarangay(latitude: number, longitude: number): BarangayMatch | null {
  const barangays = bundle.barangays;
  if (!barangays?.length) return null;

  let nearest: GeoBarangay | null = null;
  let nearestKm = Infinity;

  for (const brgy of barangays) {
    if (brgy.polygon && pointInRing(longitude, latitude, brgy.polygon)) {
      return {
        name: brgy.name,
        district: brgy.district,
        precision: 'polygon',
        distanceKm: haversineKm(longitude, latitude, brgy.lon, brgy.lat),
        approximate: brgy.approx === true,
      };
    }
    const km = haversineKm(longitude, latitude, brgy.lon, brgy.lat);
    if (km < nearestKm) {
      nearestKm = km;
      nearest = brgy;
    }
  }

  if (!nearest || nearestKm > MAX_CENTROID_KM) return null;
  return {
    name: nearest.name,
    district: nearest.district,
    precision: 'nearest',
    distanceKm: nearestKm,
    approximate: nearest.approx === true,
  };
}

/* ---------------------------------------------------------------------------
   Offline street lookup
   ---------------------------------------------------------------------------
   The barangay answers "which area"; this answers "which street", so an address
   can be written with the radio off. The names come from the same OpenFreeMap
   tiles the map draws, so the street named here is the one on the screen.
   ------------------------------------------------------------------------- */

/**
 * Farther than this, no street is named.
 *
 * A GPS fix is good to ~20 m and a house sits back from its road, so the right
 * street is usually within a few tens of metres. Beyond 60 m the nearest line is
 * as likely to be the street behind as the one in front, and a confident wrong
 * address is worse than an empty field the inspector fills in.
 */
const MAX_STREET_M = 60;

const M_PER_DEG_LAT = 111_320;

interface StreetIndexEntry {
  name: number;
  coords: number[][];
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

let streetIndex: StreetIndexEntry[] | null = null;

/** Bounding boxes, built on first use rather than at app start. */
function streets(): StreetIndexEntry[] {
  if (streetIndex) return streetIndex;
  streetIndex = (bundle.streets?.pieces ?? []).map(([name, coords]) => {
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of coords) {
      if (lon! < minLon) minLon = lon!;
      if (lon! > maxLon) maxLon = lon!;
      if (lat! < minLat) minLat = lat!;
      if (lat! > maxLat) maxLat = lat!;
    }
    return { name, coords, minLon, maxLon, minLat, maxLat };
  });
  return streetIndex;
}

/**
 * The named street nearest a coordinate, if one is close enough to be the
 * building's own. Works offline.
 */
export function nearestStreet(latitude: number, longitude: number): string | null {
  const names = bundle.streets?.names;
  if (!names?.length) return null;

  // Local flat-earth metres: exact enough across a few hundred metres, and far
  // cheaper than haversine for the thousands of segments this touches.
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180);
  const padLat = MAX_STREET_M / M_PER_DEG_LAT;
  const padLon = MAX_STREET_M / mPerDegLon;

  let best: number | null = null;
  let bestM = MAX_STREET_M;

  for (const piece of streets()) {
    if (
      longitude < piece.minLon - padLon ||
      longitude > piece.maxLon + padLon ||
      latitude < piece.minLat - padLat ||
      latitude > piece.maxLat + padLat
    ) {
      continue;
    }
    const c = piece.coords;
    for (let i = 0; i < c.length - 1; i++) {
      const ax = (c[i]![0]! - longitude) * mPerDegLon;
      const ay = (c[i]![1]! - latitude) * M_PER_DEG_LAT;
      const bx = (c[i + 1]![0]! - longitude) * mPerDegLon;
      const by = (c[i + 1]![1]! - latitude) * M_PER_DEG_LAT;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      // Distance from the origin (the query point) to segment a-b.
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < bestM) {
        bestM = d;
        best = piece.name;
      }
    }
  }

  return best == null ? null : (names[best] ?? null);
}

/**
 * Where a barangay is, for pointing the map at it. Null if the bundle cannot
 * place it (a few barangays have no geocoded centre).
 */
export function barangayCentre(name: string): { latitude: number; longitude: number } | null {
  const needle = name.trim().toLowerCase();
  const hit = (bundle.barangays ?? []).find((b) => b.name.toLowerCase() === needle);
  return hit ? { latitude: hit.lat, longitude: hit.lon } : null;
}

/**
 * The middle of a district, as the mean of its barangays' centres.
 *
 * Derived from the bundle rather than written down: the portal carries
 * hand-set district focus points, and a figure maintained by hand in two places
 * is one that eventually disagrees with the data it summarises.
 */
export function districtCentre(district: string): { latitude: number; longitude: number } | null {
  const members = (bundle.barangays ?? []).filter((b) => b.district === district);
  if (!members.length) return null;
  return {
    latitude: members.reduce((sum, b) => sum + b.lat, 0) / members.length,
    longitude: members.reduce((sum, b) => sum + b.lon, 0) / members.length,
  };
}

/** Every barangay the bundle can place, for the offline suggestion index. */
export function knownBarangays(): readonly GeoBarangay[] {
  return bundle.barangays ?? [];
}

/** Sample elevation, slope, fault distance for a GPS fix (offline). */
export function sampleGeoFeatures(latitude: number, longitude: number): GeoSample {
  const cell = nearestGridCell(latitude, longitude);
  const faultKm = nearestFaultKm(longitude, latitude);
  if (!cell) {
    return { elevation_m: 120, slope_deg: 3, distance_to_fault_km: faultKm };
  }
  return {
    elevation_m: cell.elevation_m,
    slope_deg: cell.slope_deg,
    distance_to_fault_km: faultKm,
  };
}
