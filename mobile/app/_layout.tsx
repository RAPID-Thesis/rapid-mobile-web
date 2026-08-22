import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Colors, Typography } from '../constants/theme';
import { TypographyProvider } from '../context/TypographyContext';
import { AuthProvider } from '../context/AuthContext';
import { SyncOnReconnect } from '../components/SyncOnReconnect';
import PasswordRecoveryLinkHandler from '../components/PasswordRecoveryLinkHandler';
import { initOnDeviceMl } from '../services/onDeviceMl';
import ErrorBoundary from '../components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Stage the bundled models on launch rather than on the first prediction.
  // Copying ~137 MB out of the APK takes a moment, and doing it lazily meant the
  // inspector waited for it at "Save Assessment" -- the worst possible time.
  // Deliberately not awaited: the UI must not block on it, and predictOnDevice
  // still calls initOnDeviceMl() itself if this has not finished.
  useEffect(() => {
    void initOnDeviceMl();
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const interLoaded = Boolean(fontsLoaded && !fontError);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SyncOnReconnect />
        <PasswordRecoveryLinkHandler />
        <TypographyProvider value={{ interLoaded }}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: Colors.primary },
              headerTintColor: '#FFFFFF',
              headerTitleStyle: {
                fontWeight: interLoaded ? undefined : '700',
                fontFamily: interLoaded ? Typography.fontFamily.bold : undefined,
              },
              contentStyle: { backgroundColor: Colors.background },
            }}
          >
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="assessment/new"
              options={{ title: 'New Assessment', presentation: 'modal' }}
            />
            <Stack.Screen
              name="assessment/[id]"
              options={{ title: 'Assessment Detail' }}
            />
          </Stack>
        </TypographyProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
