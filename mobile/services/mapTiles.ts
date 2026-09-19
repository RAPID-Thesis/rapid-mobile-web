import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { SJDM_BOUNDS } from '../constants/sjdmLocations';

/* ============================================================================
   Street map tiles, online and offline

   The pin picker's basemap is MapLibre drawing OpenFreeMap tiles. That pair
   replaced expo-maps, which on Android can only show Google's tiles -- and those
   need a billing-enabled Google Cloud project (a US$30 prepayment) before they
   draw anything. OpenFreeMap is free with no key, no account and no request
   limit; its one condition is the attribution line MapLibre renders itself.

   It is run by one person with no uptime guarantee, so the style is a single
   setting: EXPO_PUBLIC_MAP_STYLE_URL can point at any MapLibre style -- MapTiler's
   free tier, say -- without touching code. It is read at build time, like every
   EXPO_PUBLIC_* value.

   The part that matters most here is offline. Once per install, while the phone
   has signal, the city is downloaded as a MapLibre offline pack, and from then on
   the picker shows real streets with the radio off. Without a completed pack the
   picker falls back to its barangay schematic, exactly as before.
   ========================================================================= */

const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE_URL;

/**
 * The offline region: the city limits plus about 1 km on each side, so a pin
 * dropped on the boundary still has streets around it.
 */
const PACK_PAD_DEG = 0.01;
const PACK_BOUNDS: [number, number, number, number] = [
  SJDM_BOUNDS.west - PACK_PAD_DEG,
  SJDM_BOUNDS.south - PACK_PAD_DEG,
  SJDM_BOUNDS.east + PACK_PAD_DEG,
  SJDM_BOUNDS.north + PACK_PAD_DEG,
];

/**
 * Zooms 10-14. OpenFreeMap's vector source stops at 14 and MapLibre draws street
 * level by overzooming it, so fetching beyond 14 would download nothing new.
 * Measured against the live service, one z14 tile over the city centre is about
 * 125 KB; the whole region comes to a few megabytes.
 */
const PACK_MIN_ZOOM = 10;
const PACK_MAX_ZOOM = 14;

/**
 * Identifies our pack. The style URL is part of the identity: a pack downloaded
 * for one style is useless to another, so changing EXPO_PUBLIC_MAP_STYLE_URL
 * makes the app download a fresh one rather than trust a mismatched cache.
 */
const PACK_NAME = 'sjdm-streets-v1';

type MapLibreModule = typeof import('@maplibre/maplibre-react-native');

let mod: MapLibreModule | null | undefined;

/**
 * MapLibre, if this build has it.
 *
 * Required lazily, like the other native modules in this app: importing it at
 * module scope would take down the web bundle and any build where the native
 * side is not linked, rather than falling back to the schematic.
 */
export function getMapLibre(): MapLibreModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web') {
    mod = null;
    return mod;
  }
  try {
    mod = require('@maplibre/maplibre-react-native') as MapLibreModule;
  } catch (e) {
    console.warn('[map] MapLibre unavailable in this build:', e);
    mod = null;
  }
  return mod;
}

let offlineReady = false;
let ensuring: Promise<void> | null = null;

/** Whether the city's street map is fully downloaded and usable with no signal. */
export function isOfflineMapReady(): boolean {
  return offlineReady;
}

async function findOurPack(maplibre: MapLibreModule) {
  const packs = await maplibre.OfflineManager.getPacks();
  return (
    packs.find(
      (pack) => pack.metadata?.name === PACK_NAME && pack.metadata?.style === MAP_STYLE_URL,
    ) ?? null
  );
}

/**
 * Make sure the offline street map exists, downloading it if needed.
 *
 * Safe to call on every launch: it checks for a finished pack first, resumes a
 * partial one, and only starts a download when there is none and the phone is
 * online. Never throws -- a failed download leaves the schematic in place, which
 * is how the picker worked before any of this existed.
 */
export function ensureOfflineMap(): Promise<void> {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const maplibre = getMapLibre();
    if (!maplibre) return;

    try {
      const existing = await findOurPack(maplibre);
      if (existing) {
        const status = await existing.status();
        // `state` alone. While MapLibre is still discovering how many resources
        // a pack needs, `percentage` can read 100 early -- a download cut off at
        // that point would then be trusted, and the picker would draw an empty
        // "saved" map offline instead of falling back to the schematic.
        if (status.state === 'complete') {
          offlineReady = true;
          return;
        }
      }

      const net = await NetInfo.fetch();
      if (net.isConnected !== true || net.isInternetReachable === false) return;

      if (existing) {
        await maplibre.OfflineManager.addListener(
          existing.id,
          (_pack, status) => {
            if (status.state === 'complete') offlineReady = true;
          },
          (_pack, error) => console.warn('[map] offline pack error:', error.message),
        );
        await existing.resume();
        return;
      }

      await maplibre.OfflineManager.createPack(
        {
          // A URL, never an inline style object: a pack created from an inline
          // style is persisted in a form that crashes the app on later launches
          // (maplibre-react-native issue #1646).
          mapStyle: MAP_STYLE_URL,
          bounds: PACK_BOUNDS,
          minZoom: PACK_MIN_ZOOM,
          maxZoom: PACK_MAX_ZOOM,
          metadata: { name: PACK_NAME, style: MAP_STYLE_URL },
        },
        (_pack, status) => {
          if (status.state === 'complete') offlineReady = true;
        },
        (_pack, error) => console.warn('[map] offline pack error:', error.message),
      );
    } catch (e) {
      console.warn('[map] could not prepare the offline street map:', e);
    }
  })().finally(() => {
    // Let a later launch-time or picker-open call try again, e.g. once the
    // phone regains signal.
    ensuring = null;
  });
  return ensuring;
}
