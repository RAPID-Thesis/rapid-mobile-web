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

interface GeoBundle {
  /** 1 = grid + faults only. 2 adds `barangays`, which stays optional. */
  version?: number;
  bounds: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  grid_step_deg: number;
  fault_segments: number[][][];
  grid: GeoCell[];
  barangays?: GeoBarangay[];
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
