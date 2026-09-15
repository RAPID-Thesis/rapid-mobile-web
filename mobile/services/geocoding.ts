import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SJDM_BOUNDS,
  SJDM_MUNICIPALITY,
  getDistrictForBarangay,
  isWithinSjdm,
  type SjdmDistrict,
} from '../constants/sjdmLocations';
import { knownBarangays, lookupBarangay } from './ml/geoLookup';

/* ============================================================================
   Address search and reverse geocoding

   Two tiers behind one interface, because the field half of this product has no
   network. Online we ask Nominatim, which knows streets and subdivisions.
   Offline we fall back to what the phone already carries: the barangay layer in
   the geo bundle, and every address this device has typed before.

   The offline tier is not a degraded copy of the online one — it answers a
   narrower question (which barangay is this, which addresses have I used here)
   and says so, so the wizard can present a guess as a guess.

   Nominatim rather than Google Places: no key, no billing, and the portal's
   HeatmapPage already calls it, so this is not a new vendor. Its usage policy
   caps us at one request per second and asks for a real User-Agent, both of
   which are enforced below.
   ========================================================================= */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'RAPID-seismic-assessment/1.0 (LGU field assessment app)';

/** Nominatim's policy ceiling is 1 req/s; this is the floor between requests. */
const MIN_REQUEST_GAP_MS = 1100;
/** A search is abandoned rather than left hanging over a weak field connection. */
const REQUEST_TIMEOUT_MS = 6000;

const CACHE_KEY = 'rapid.geocode.cache.v1';
/** Enough to cover a day's worth of repeat lookups without unbounded growth. */
const CACHE_LIMIT = 200;

export interface AddressSuggestion {
  /** What goes in the address field. */
  label: string;
  /** Longer context for the second line of the row, when there is more to say. */
  detail?: string;
  barangay?: string;
  district?: SjdmDistrict;
  latitude?: number;
  longitude?: number;
  /**
   * Where this came from, so the UI can be honest about it:
   *   'online'   — Nominatim
   *   'barangay' — the bundled barangay layer
   *   'recent'   — an address previously submitted on this device
   */
  source: 'online' | 'barangay' | 'recent';
}

export interface ReverseGeocodeResult {
  /** A single line suitable for the address field, or null if we only got a barangay. */
  address: string | null;
  barangay: string | null;
  district: SjdmDistrict | null;
  /**
   * 'exact'       — a street-level match from Nominatim
   * 'barangay'    — inside a mapped barangay boundary
   * 'approximate' — nearest barangay centroid; offer it, do not assert it
   */
  precision: 'exact' | 'barangay' | 'approximate';
  source: 'online' | 'offline';
}

/* -------------------------------------------------------------------------- */
/* Request pacing and caching                                                 */
/* -------------------------------------------------------------------------- */

let lastRequestAt = 0;

async function paced<T>(run: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  return run();
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

type Cache = Record<string, { value: unknown; at: number }>;

async function readCache(): Promise<Cache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    return {};
  }
}

/**
 * Remember a response so a lookup made in signal survives losing it.
 *
 * Trimmed oldest-first when it grows past the limit — a field day produces a lot
 * of near-identical queries and none of them are worth unbounded storage.
 */
async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    const cache = await readCache();
    cache[key] = { value, at: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_LIMIT) {
      keys
        .sort((a, b) => (cache[a]?.at ?? 0) - (cache[b]?.at ?? 0))
        .slice(0, keys.length - CACHE_LIMIT)
        .forEach((k) => delete cache[k]);
    }
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A cache miss is survivable; a crash in the address field is not.
  }
}

async function cached<T>(key: string, run: () => Promise<T>): Promise<T | null> {
  try {
    const value = await paced(run);
    void writeCache(key, value);
    return value;
  } catch {
    const cache = await readCache();
    const hit = cache[key];
    return hit ? (hit.value as T) : null;
  }
}

/* -------------------------------------------------------------------------- */
/* Recently used addresses                                                    */
/* -------------------------------------------------------------------------- */

const RECENT_KEY = 'rapid.geocode.recent.v1';
const RECENT_LIMIT = 60;

interface RecentAddress {
  address: string;
  barangay: string;
  at: number;
}

/**
 * Record an address the inspector actually submitted.
 *
 * This is the offline index that earns its keep: field teams re-visit the same
 * subdivisions, so yesterday's addresses are the best available autocomplete
 * when there is no signal, and they need no geocoder to produce.
 */
export async function rememberAddress(address: string, barangay: string): Promise<void> {
  const trimmed = address.trim();
  if (!trimmed) return;
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const list: RecentAddress[] = raw ? JSON.parse(raw) : [];
    const deduped = list.filter((r) => r.address.toLowerCase() !== trimmed.toLowerCase());
    deduped.unshift({ address: trimmed, barangay, at: Date.now() });
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(deduped.slice(0, RECENT_LIMIT)));
  } catch {
    // Non-essential.
  }
}

async function readRecent(): Promise<RecentAddress[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentAddress[]) : [];
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Offline suggestions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Rank by where the query matches: a prefix beats a word boundary, which beats a
 * substring. Typing "san" should reach "San Rafael I" before "Sapang Palay".
 */
function matchScore(haystack: string, needle: string): number {
  const text = haystack.toLowerCase();
  const index = text.indexOf(needle);
  if (index < 0) return -1;
  if (index === 0) return 2;
  return text[index - 1] === ' ' ? 1 : 0;
}

function offlineSuggestions(query: string, recent: RecentAddress[]): AddressSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const scored: { score: number; suggestion: AddressSuggestion }[] = [];

  for (const entry of recent) {
    const score = matchScore(entry.address, needle);
    if (score < 0) continue;
    scored.push({
      // Previously-used addresses outrank barangay names: they are more specific
      // and the inspector has already vouched for them.
      score: score + 3,
      suggestion: {
        label: entry.address,
        detail: entry.barangay ? `Used before · ${entry.barangay}` : 'Used before',
        barangay: entry.barangay || undefined,
        district: getDistrictForBarangay(entry.barangay) ?? undefined,
        source: 'recent',
      },
    });
  }

  for (const brgy of knownBarangays()) {
    const score = matchScore(brgy.name, needle);
    if (score < 0) continue;
    scored.push({
      score,
      suggestion: {
        label: `${brgy.name}, ${SJDM_MUNICIPALITY}`,
        detail: brgy.district || undefined,
        barangay: brgy.name,
        district: getDistrictForBarangay(brgy.name) ?? undefined,
        latitude: brgy.lat,
        longitude: brgy.lon,
        source: 'barangay',
      },
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.suggestion);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string>;
}

function barangayFromAddress(address: Record<string, string> | undefined): string | null {
  if (!address) return null;
  // Nominatim files barangays under whichever of these the contributor used.
  for (const key of ['village', 'suburb', 'neighbourhood', 'quarter', 'city_district']) {
    const value = address[key];
    if (value && getDistrictForBarangay(value)) return value;
  }
  return null;
}

/**
 * Address suggestions for what the inspector has typed so far.
 *
 * Always returns the offline matches immediately usable; the online tier is
 * additive. Callers debounce — this does not, because the right debounce depends
 * on the input, not on the transport.
 */
export async function suggestAddresses(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const recent = await readRecent();
  const offline = offlineSuggestions(trimmed, recent);

  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    bounded: '1',
    viewbox: `${SJDM_BOUNDS.west},${SJDM_BOUNDS.north},${SJDM_BOUNDS.east},${SJDM_BOUNDS.south}`,
    q: `${trimmed}, ${SJDM_MUNICIPALITY}, Bulacan, Philippines`,
  });

  const places = await cached<NominatimPlace[]>(`search:${trimmed.toLowerCase()}`, () =>
    getJson(`${NOMINATIM_BASE}/search?${params.toString()}`) as Promise<NominatimPlace[]>,
  );

  if (!places?.length) return offline;

  const online: AddressSuggestion[] = [];
  for (const place of places) {
    const latitude = Number.parseFloat(place.lat);
    const longitude = Number.parseFloat(place.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (!isWithinSjdm(latitude, longitude)) continue;

    const barangay = barangayFromAddress(place.address);
    // display_name tails off into "Bulacan, Central Luzon, Philippines" on every
    // row, which is noise when every result is in the same city.
    const label = place.display_name.split(',').slice(0, 3).join(',').trim();
    online.push({
      label,
      detail: barangay ?? undefined,
      barangay: barangay ?? undefined,
      district: barangay ? (getDistrictForBarangay(barangay) ?? undefined) : undefined,
      latitude,
      longitude,
      source: 'online',
    });
  }

  // Online results lead, but keep the recent ones the inspector has vouched for.
  const recents = offline.filter((s) => s.source === 'recent');
  const seen = new Set<string>();
  return [...recents, ...online]
    .filter((s) => !seen.has(s.label.toLowerCase()) && seen.add(s.label.toLowerCase()))
    .slice(0, 8);
}

/**
 * Name a coordinate — after a GPS fix or a map pin drop.
 *
 * Offline this can only reach barangay level, and `precision` says which of
 * "inside this boundary" and "nearest to this centre" it managed. The caller
 * must not present an 'approximate' result as a confirmed address.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '18',
    lat: String(latitude),
    lon: String(longitude),
  });

  const key = `reverse:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const place = await cached<NominatimPlace>(key, () =>
    getJson(`${NOMINATIM_BASE}/reverse?${params.toString()}`) as Promise<NominatimPlace>,
  );

  if (place?.display_name) {
    const barangay = barangayFromAddress(place.address);
    return {
      address: place.display_name.split(',').slice(0, 3).join(',').trim(),
      barangay,
      district: barangay ? getDistrictForBarangay(barangay) : null,
      precision: 'exact',
      source: 'online',
    };
  }

  const match = lookupBarangay(latitude, longitude);
  if (!match) return null;

  return {
    // Deliberately not a street address: the bundle has no street data, and
    // inventing one from a centroid would be worse than leaving the field empty.
    address: null,
    barangay: match.name,
    district: getDistrictForBarangay(match.name),
    precision: match.precision === 'polygon' && !match.approximate ? 'barangay' : 'approximate',
    source: 'offline',
  };
}
