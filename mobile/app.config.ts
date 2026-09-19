import type { ExpoConfig } from 'expo/config';

/* ============================================================================
   Expo config

   Executable rather than app.json so values can come from the environment
   instead of being hardcoded. EXPO_PUBLIC_* values -- including the optional
   EXPO_PUBLIC_MAP_STYLE_URL read by services/mapTiles.ts -- are baked in at
   build time, so changing one means rebuilding.

   The pin picker's map is MapLibre drawing OpenFreeMap tiles, which need no API
   key. It replaced expo-maps, which on Android could only show Google's tiles,
   and those need a billing-enabled Google Cloud project before they draw.
   ========================================================================= */

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
    '@maplibre/maplibre-react-native',
  ],
  assetBundlePatterns: ['assets/**/*'],
  extra: {
    router: {},
    eas: {
      projectId: '11ec69cc-bb74-479d-a5e4-8203f5889ed5',
    },
  },
};

export default config;
