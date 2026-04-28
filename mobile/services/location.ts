import * as Location from 'expo-location';

export interface LocationPermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  capturedAt: string;
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
