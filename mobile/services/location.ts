import * as Location from 'expo-location';

export interface LocationPermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Where a coordinate came from.
 *
 * The three are not interchangeable and the record should not pretend they are:
 * a GPS fix is a measurement with an accuracy figure, a dropped pin is the
 * inspector's own judgement about where the building is, and a search result
 * locates a named place that may be a street or a whole barangay. This rides
 * along into `structural_data` as `location_source` so the portal can tell them
 * apart after the fact.
 */
export type LocationSource = 'gps' | 'map-pin' | 'search';

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  capturedAt: string;
  source: LocationSource;
}

interface CurrentFixOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12000;

export async function requestLocationPermission(): Promise<LocationPermissionResult> {
  const result = await Location.requestForegroundPermissionsAsync();
  return {
    granted: result.granted,
    canAskAgain: result.canAskAgain,
  };
}

function toFix(coords: Location.LocationObjectCoords): LocationFix {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy_m: typeof coords.accuracy === 'number' ? coords.accuracy : null,
    capturedAt: new Date().toISOString(),
    source: 'gps',
  };
}

export async function getCurrentFix(options?: CurrentFixOptions): Promise<LocationFix | null> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutPromise = new Promise<null>((resolve) => {
    const timeout = setTimeout(() => {
      clearTimeout(timeout);
      resolve(null);
    }, timeoutMs);
  });

  const livePromise = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  })
    .then((value) => toFix(value.coords))
    .catch(() => null);

  const liveOrTimeout = await Promise.race([livePromise, timeoutPromise]);
  if (liveOrTimeout) return liveOrTimeout;

  const lastKnown = await Location.getLastKnownPositionAsync();
  if (!lastKnown) return null;
  return toFix(lastKnown.coords);
}
