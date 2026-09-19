import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';

import Text from './CustomText';
import { BorderRadius, Colors, FontSize, MinTouchTarget, Spacing } from '../constants/theme';
import { SJDM_BOUNDS, isWithinSjdm } from '../constants/sjdmLocations';
import { knownBarangays, lookupBarangay, sampleGeoFeatures } from '../services/ml/geoLookup';
import { hasLocationPermission, type LocationFix } from '../services/location';
import {
  MAP_STYLE_URL,
  ensureOfflineMap,
  getMapLibre,
  isOfflineMapReady,
} from '../services/mapTiles';

/* ============================================================================
   Pin picker

   A GPS fix lands where the inspector is standing, which is the street, the
   neighbour's lot, or wherever the phone last managed a lock. The building is
   somewhere else. This lets them say where.

   The pin is fixed at the centre and the map moves under it. That is not a
   stylistic choice: a draggable marker puts the inspector's thumb on top of the
   exact pixel they are trying to place, and on a phone in the field that is the
   difference between a 5 m and a 20 m error.

   Two backends behind one screen:

     street map    MapLibre drawing OpenFreeMap tiles (services/mapTiles.ts):
                   live when online, and offline from the city pack the app
                   downloads once while it has signal
     schematic     the bundled geo data, for a phone that has never had signal
                   since the offline pack was introduced

   The schematic is not a broken map. It plots the 57 barangay centres the
   bundle carries, labels the nearest ones, and reports live distance-to-fault
   from the same grid the Random Forest reads — an inspector orients by "which
   barangay am I in", and that question it can answer with the radio off. What
   it cannot draw is streets, so it does not pretend to.
   ========================================================================= */

const SJDM_CENTER = { latitude: 14.8138, longitude: 121.0453 };

/** Visible latitude span per zoom step, widest first. Index is the zoom level. */
const ZOOM_SPANS = [0.16, 0.08, 0.04, 0.02, 0.01, 0.005, 0.0025];
const DEFAULT_ZOOM_INDEX = 4;

/**
 * Where the offline schematic opens: a ~2.2 km window rather than the basemap's
 * ~1.1 km. The schematic's only landmarks are barangay centres, and at the
 * street-level zoom the basemap wants, a typical point in the city had two of
 * them on screen -- and none after a single zoom-in, which read as a blank,
 * broken map. One step wider shows four to seven, labelled.
 */
const SCHEMATIC_DEFAULT_ZOOM_INDEX = 3;

/** Longest the picker waits on the offline-map check before choosing a view. */
const OFFLINE_CHECK_TIMEOUT_MS = 3000;

/** Web-Mercator zoom levels that frame roughly the same area as ZOOM_SPANS. */
const MAP_ZOOM = [11, 12, 13, 14, 15, 16, 17];

/** Whether this build carries the street-map renderer at all. */
const streetMapAvailable = getMapLibre() != null;

interface LocationPickerProps {
  visible: boolean;
  /** Where to open. Falls back to the centre of the city. */
  initial: { latitude: number; longitude: number } | null;
  onCancel: () => void;
  onConfirm: (fix: LocationFix) => void;
}

export default function LocationPicker({
  visible,
  initial,
  onCancel,
  onConfirm,
}: LocationPickerProps) {
  const [center, setCenter] = useState(initial ?? SJDM_CENTER);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [online, setOnline] = useState<boolean | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  // Incremented whenever the camera must be repositioned programmatically.
  const [command, setCommand] = useState(0);

  // Re-anchor when the sheet opens: the fix may have improved, or the inspector
  // may have moved on to another building since last time.
  //
  // Keyed on `visible` alone, deliberately. `initial` is built fresh by the
  // parent on every render, so depending on it re-runs this whenever anything in
  // the wizard changes -- including the reverse-geocode that a pin confirmation
  // itself kicks off. The pin would snap back to the phone's own position at
  // default zoom, throwing away the pan the inspector just made.
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    if (visible) {
      setCenter(initialRef.current ?? SJDM_CENTER);
      setZoomIndex(DEFAULT_ZOOM_INDEX);
      setCommand((c) => c + 1);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // Start from "unknown" on every open. Keeping the previous open's answer
    // would render that backend for up to the check timeout -- a street map
    // with no tiles, say, after signal was lost since -- then swap abruptly.
    setOnline(null);
    // Wait for the offline-map check before choosing a backend. It runs at
    // launch too, but asynchronously -- open the picker quickly after starting
    // the app with no signal and that check may not have reported yet, which
    // would show the schematic even though the streets are on the phone. The
    // cap means a stuck native call can never leave the spinner up; online it
    // also doubles as a second chance to start the download.
    const offlineCheck = Promise.race([
      ensureOfflineMap(),
      new Promise<void>((resolve) => setTimeout(resolve, OFFLINE_CHECK_TIMEOUT_MS)),
    ]);
    void Promise.all([NetInfo.fetch(), offlineCheck]).then(([state]) => {
      if (cancelled) return;
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      const ready = isOfflineMapReady();
      setOnline(isOnline);
      setOfflineReady(ready);
      // Same condition as useBasemap below: the schematic needs a wider window.
      if (!(streetMapAvailable && (isOnline || ready))) {
        setZoomIndex(SCHEMATIC_DEFAULT_ZOOM_INDEX);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Streets whenever MapLibre can draw them: online from the network, offline
  // from the downloaded city pack. The schematic is only for an install that
  // has never had signal since the pack was introduced.
  const offlineStreets = online === false && offlineReady;
  const useBasemap = streetMapAvailable && (online === true || offlineStreets);

  const [showUser, setShowUser] = useState(false);
  useEffect(() => {
    if (!visible) return;
    void hasLocationPermission().then(setShowUser);
  }, [visible]);

  const barangay = useMemo(
    () => lookupBarangay(center.latitude, center.longitude),
    [center.latitude, center.longitude],
  );
  const site = useMemo(
    () => sampleGeoFeatures(center.latitude, center.longitude),
    [center.latitude, center.longitude],
  );
  const outsideStudyArea = !isWithinSjdm(center.latitude, center.longitude);

  const confirm = () => {
    onConfirm({
      latitude: center.latitude,
      longitude: center.longitude,
      // A pin carries no accuracy figure. Reporting one would be inventing a
      // measurement the inspector never took.
      accuracy_m: null,
      capturedAt: new Date().toISOString(),
      source: 'map-pin',
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={onCancel} accessibilityLabel="Cancel">
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Set building location</Text>
          <View style={styles.iconBtnSpacer} />
        </View>

        <View style={styles.mapArea}>
          {online === null ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : useBasemap ? (
            <BasemapView
              center={center}
              zoomIndex={zoomIndex}
              command={command}
              showUser={showUser}
              onCenterChange={setCenter}
            />
          ) : (
            <SchematicView
              center={center}
              zoomIndex={zoomIndex}
              onCenterChange={setCenter}
            />
          )}

          {/* The pin sits above whichever backend rendered, so the two views
              agree pixel-for-pixel about what "the centre" means. */}
          <View pointerEvents="none" style={styles.pinLayer}>
            <Ionicons name="location" size={40} color={Colors.unsafe} />
            <View style={styles.pinShadow} />
          </View>

          <View style={styles.zoomControls}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoomIndex((z) => Math.min(ZOOM_SPANS.length - 1, z + 1))}
              accessibilityLabel="Zoom in"
            >
              <Ionicons name="add" size={22} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoomIndex((z) => Math.max(0, z - 1))}
              accessibilityLabel="Zoom out"
            >
              <Ionicons name="remove" size={22} color={Colors.text} />
            </TouchableOpacity>
            {initial ? (
              <TouchableOpacity
                style={styles.zoomBtn}
                onPress={() => {
                  setCenter(initialRef.current ?? SJDM_CENTER);
                  setCommand((c) => c + 1);
                }}
                accessibilityLabel="Back to my location"
              >
                <Ionicons name="locate" size={20} color={Colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.footer}>
          {offlineStreets ? (
            <View style={styles.offlineNote}>
              <Ionicons name="cloud-offline-outline" size={16} color={Colors.restrictedDeep} />
              <Text style={styles.offlineNoteText}>
                No connection — showing the saved street map of San Jose del Monte.
              </Text>
            </View>
          ) : !useBasemap && online !== null ? (
            <View style={styles.offlineNote}>
              <Ionicons name="cloud-offline-outline" size={16} color={Colors.restrictedDeep} />
              <Text style={styles.offlineNoteText}>
                {streetMapAvailable
                  ? 'No connection, and the street map has not been saved yet — showing barangay centres. Open the app once with signal to save it for offline use.'
                  : 'The street map is not available in this build — showing barangay centres.'}
              </Text>
            </View>
          ) : null}

          <Text style={styles.coords}>
            {center.latitude.toFixed(6)}, {center.longitude.toFixed(6)}
          </Text>

          <Text style={styles.context}>
            {barangay
              ? `${barangay.name}${barangay.precision === 'nearest' ? ' (nearest)' : ''} · ${site.distance_to_fault_km.toFixed(1)} km to fault`
              : `${site.distance_to_fault_km.toFixed(1)} km to fault`}
          </Text>

          {outsideStudyArea ? (
            <Text style={styles.warning}>
              This point is outside San Jose del Monte. Saving it will place the record off the
              heatmap.
            </Text>
          ) : null}

          <TouchableOpacity style={styles.primaryBtn} onPress={confirm} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Use this location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Online: Google basemap                                                     */
/* -------------------------------------------------------------------------- */

function BasemapView({
  center,
  zoomIndex,
  command,
  showUser,
  onCenterChange,
}: {
  center: { latitude: number; longitude: number };
  zoomIndex: number;
  /** Bumped when the camera should follow `center` rather than the finger. */
  command: number;
  /** Draw the blue "you are here" dot. Only when location permission is held. */
  showUser: boolean;
  onCenterChange: (next: { latitude: number; longitude: number }) => void;
}) {
  const maplibre = useMemo(() => getMapLibre(), []);
  const cameraRef = useRef<CameraRef | null>(null);
  const centerRef = useRef(center);
  centerRef.current = center;

  // The camera is driven by the user's finger, so feeding `center` back in on
  // every frame would fight them. It is moved programmatically only when
  // something other than panning should move it -- a zoom button, or "back to
  // my location" -- which is what `command` and `zoomIndex` signal.
  useEffect(() => {
    const target = centerRef.current;
    cameraRef.current?.easeTo({
      center: [target.longitude, target.latitude],
      zoom: MAP_ZOOM[zoomIndex] ?? 15,
      duration: 250,
    });
  }, [zoomIndex, command]);

  if (!maplibre) {
    return (
      <View style={styles.centered}>
        <Text style={styles.fallbackText}>Map unavailable in this build.</Text>
      </View>
    );
  }

  const { Map, Camera, NativeUserLocation } = maplibre;

  const follow = (event: { nativeEvent: { center: [number, number] } }) => {
    const [longitude, latitude] = event.nativeEvent.center;
    onCenterChange({ latitude, longitude });
  };

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE_URL}
      // A flat, north-up map: tilting or rotating it adds nothing to placing a
      // pin and makes the readout harder to trust.
      touchPitch={false}
      touchRotate={false}
      compass={false}
      onRegionIsChanging={follow}
      onRegionDidChange={follow}
    >
      <Camera
        ref={cameraRef}
        initialViewState={{
          center: [center.longitude, center.latitude],
          zoom: MAP_ZOOM[zoomIndex] ?? 15,
        }}
      />
      {showUser ? <NativeUserLocation /> : null}
    </Map>
  );
}

/* -------------------------------------------------------------------------- */
/* Offline: schematic drawn from the bundled geo data                         */
/* -------------------------------------------------------------------------- */

function SchematicView({
  center,
  zoomIndex,
  onCenterChange,
}: {
  center: { latitude: number; longitude: number };
  zoomIndex: number;
  onCenterChange: (next: { latitude: number; longitude: number }) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  // PanResponder rather than react-native-gesture-handler: this modal is not
  // inside a GestureHandlerRootView, and the core responder system needs no
  // provider to work.
  //
  // Everything the handlers read lives in refs, so the responder object can be
  // built once. Putting `center` in the dependency list instead rebuilds it on
  // every frame of a drag -- the centre changes, the memo re-runs, and React
  // swaps panHandlers mid-gesture, which drops the rest of the drag.
  const dragOrigin = useRef(center);
  const latest = useRef({ center, latSpan: 0, lonSpan: 0, size });

  const latSpan = ZOOM_SPANS[zoomIndex] ?? 0.01;
  const lonSpan = size.height > 0 ? (latSpan * size.width) / size.height : latSpan;
  latest.current = { center, latSpan, lonSpan, size };

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          dragOrigin.current = latest.current.center;
        },
        onPanResponderMove: (_evt, gesture) => {
          const { latSpan: lat, lonSpan: lon, size: box } = latest.current;
          if (box.width === 0 || box.height === 0) return;
          // Dragging moves the map, so the centre travels against the finger.
          onCenterChange({
            latitude: dragOrigin.current.latitude + (gesture.dy / box.height) * lat,
            longitude: dragOrigin.current.longitude - (gesture.dx / box.width) * lon,
          });
        },
      }),
    [onCenterChange],
  );

  const project = useCallback(
    (lat: number, lon: number) => ({
      x: size.width / 2 + ((lon - center.longitude) / lonSpan) * size.width,
      y: size.height / 2 - ((lat - center.latitude) / latSpan) * size.height,
    }),
    [center.latitude, center.longitude, latSpan, lonSpan, size.width, size.height],
  );

  // Only what is on screen, with a margin so markers do not pop in at the edge.
  const visible = useMemo(() => {
    if (size.width === 0) return [];
    return knownBarangays()
      .map((brgy) => ({ brgy, point: project(brgy.lat, brgy.lon) }))
      .filter(
        ({ point }) =>
          point.x > -80 &&
          point.x < size.width + 80 &&
          point.y > -40 &&
          point.y < size.height + 40,
      );
  }, [project, size.width, size.height]);

  // A faint graticule, four divisions per screen height and anchored to absolute
  // coordinates so it slides with a drag. Without it, panning between barangay
  // centres moved nothing visible and the view looked frozen.
  const grid = useMemo(() => {
    if (size.width === 0) return { rows: [] as number[], cols: [] as number[] };
    const step = latSpan / 4;
    const rows: number[] = [];
    const cols: number[] = [];
    const latTop = center.latitude + latSpan / 2;
    for (let lat = Math.ceil((center.latitude - latSpan / 2) / step) * step; lat <= latTop; lat += step) {
      rows.push(project(lat, center.longitude).y);
    }
    const lonRight = center.longitude + lonSpan / 2;
    for (let lon = Math.ceil((center.longitude - lonSpan / 2) / step) * step; lon <= lonRight; lon += step) {
      cols.push(project(center.latitude, lon).x);
    }
    return { rows, cols };
  }, [center.latitude, center.longitude, latSpan, lonSpan, project, size.width]);

  // The city limits, so an inspector can see whether the pin is inside them.
  const cityTopLeft = project(SJDM_BOUNDS.north, SJDM_BOUNDS.west);
  const cityBottomRight = project(SJDM_BOUNDS.south, SJDM_BOUNDS.east);
  const insideCity = isWithinSjdm(center.latitude, center.longitude);

  return (
    <View style={styles.schematic} onLayout={onLayout} {...panResponder.panHandlers}>
      {grid.rows.map((y) => (
        <View key={`r${y}`} pointerEvents="none" style={[styles.gridRow, { top: y }]} />
      ))}
      {grid.cols.map((x) => (
        <View key={`c${x}`} pointerEvents="none" style={[styles.gridCol, { left: x }]} />
      ))}
      {size.width > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.cityOutline,
            {
              left: cityTopLeft.x,
              top: cityTopLeft.y,
              width: cityBottomRight.x - cityTopLeft.x,
              height: cityBottomRight.y - cityTopLeft.y,
            },
          ]}
        />
      ) : null}

      {visible.map(({ brgy, point }) => (
        <View
          key={brgy.name}
          pointerEvents="none"
          style={[styles.brgyMarker, { left: point.x - 4, top: point.y - 4 }]}
        >
          <View style={styles.brgyDot} />
          {/* Labels only when zoomed in far enough that they will not collide. */}
          {zoomIndex >= 3 ? (
            <Text style={styles.brgyLabel} numberOfLines={1}>
              {brgy.name}
            </Text>
          ) : null}
        </View>
      ))}

      {/* No centre in view is not the same as being off the map. Inside the
          city this only means the window falls between centres, so it says
          how to find one rather than claiming the pin is somewhere unmapped. */}
      {visible.length === 0 ? (
        <View pointerEvents="none" style={styles.centered}>
          <Text style={styles.fallbackText}>
            {insideCity ? 'Zoom out to see nearby barangays' : 'Outside the mapped area'}
          </Text>
        </View>
      ) : null}

      {/* A label, not a button. It used to zoom in when tapped, so reading it
          with a finger quietly pushed the view to a zoom with nothing on it. */}
      <View pointerEvents="none" style={styles.schematicHint}>
        <Text style={styles.schematicHintText}>Drag to move the pin</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnSpacer: { width: MinTouchTarget },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },

  mapArea: { flex: 1, backgroundColor: Colors.background },
  centered: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontSize: FontSize.sm, color: Colors.textMuted },

  pinLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinShadow: {
    // The icon's tip is its anchor, so the shadow marks the actual point the
    // coordinate readout refers to.
    width: 8,
    height: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    marginTop: -4,
  },

  zoomControls: { position: 'absolute', right: Spacing.md, bottom: Spacing.md, gap: Spacing.sm },
  zoomBtn: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  schematic: { flex: 1, backgroundColor: Colors.surfaceSoft, overflow: 'hidden' },
  gridRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  gridCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  cityOutline: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: Colors.primaryBorder,
    borderRadius: BorderRadius.card,
  },
  brgyMarker: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4 },
  brgyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primaryLight,
  },
  brgyLabel: { fontSize: FontSize.xxs, color: Colors.textSecondary },
  schematicHint: {
    position: 'absolute',
    left: Spacing.md,
    bottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  schematicHintText: { fontSize: FontSize.xxs, color: Colors.textMuted },

  footer: {
    padding: Spacing.md,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.restrictedBorder,
    backgroundColor: Colors.restrictedBg,
  },
  offlineNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.restrictedDeep },
  coords: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  context: { fontSize: FontSize.xs, color: Colors.textSecondary },
  warning: { fontSize: FontSize.xs, color: Colors.unsafe },
  primaryBtn: {
    marginTop: Spacing.sm,
    minHeight: MinTouchTarget,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '700' },
});
