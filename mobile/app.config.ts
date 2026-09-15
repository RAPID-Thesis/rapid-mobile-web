import type { ExpoConfig } from 'expo/config';

/* ============================================================================
   Expo config

   Was app.json until the map landed. expo-maps renders Google Maps on Android,
   which needs an API key, and a key is a secret — the repo rule is that nothing
   is hardcoded, so the config became executable to read one from the
   environment.

   The key is read at *build* time, not runtime, and is baked into the APK like
   every other EXPO_PUBLIC_* value. Rotating it means rebuilding.

   With no key set the build still succeeds and the app still runs: expo-maps
   renders an empty grid instead of a basemap, and LocationPicker already has to
   handle exactly that case for offline use, so it degrades to the same fallback
   rather than crashing.
   ========================================================================= */

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '';

const config: ExpoConfig = {
  name: 'RADAR',
  slug: 'rapid',
  scheme: 'rapid',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.rapid.app',
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    package: 'com.rapid.app',
    // NOTE: app.json carried `usesCleartextTraffic: true` here. Expo no longer
    // reads that as a config key -- it survives only as a manifest attribute --
    // so it had already been doing nothing. Dropped rather than carried forward
    // as a setting that looks load-bearing and is not. Plain-HTTP calls to a LAN
    // EXPO_PUBLIC_API_URL still work in debug builds, which permit cleartext by
    // default; a release build pointed at plain HTTP would need an explicit
    // network security config via expo-build-properties.
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(googleMapsApiKey
      ? { config: { googleMaps: { apiKey: googleMapsApiKey } } }
      : {}),
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'onnxruntime-react-native',
    'react-native-fast-tflite',
    // Location permission is requested by services/location.ts through
    // expo-location, so the map plugin does not ask for it a second time.
    ['expo-maps', { requestLocationPermission: false }],
  ],
  assetBundlePatterns: ['assets/**/*'],
  extra: {
    router: {},
    eas: {
      projectId: '11ec69cc-bb74-479d-a5e4-8203f5889ed5',
    },
    // Whether a basemap is available at all, so LocationPicker can choose its
    // offline view up front instead of rendering an empty Google grid and
    // leaving the inspector to wonder why the map is blank. The boolean is not
    // the key and is safe to expose; the key itself stays in android.config.
    googleMapsConfigured: googleMapsApiKey.length > 0,
  },
};

export default config;
