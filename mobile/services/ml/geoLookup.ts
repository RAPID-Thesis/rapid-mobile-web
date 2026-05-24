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

interface GeoBundle {
  bounds: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  grid_step_deg: number;
  fault_segments: number[][][];
  grid: GeoCell[];
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
