import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth, isApprovedProfile } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import { useNetworkOffline } from '../hooks/useNetworkOffline';

export default function Index() {
  const { session, profile, loading, profileLoading } = useAuth();
  const { ready: netReady, offline } = useNetworkOffline();

  const showSpinner = loading || (!session && !netReady) || (Boolean(session) && profileLoading && !profile);
  if (showSpinner) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (session) {
    if (profile && !isApprovedProfile(profile)) {
      return <Redirect href="/login?error=pending" />;
    }
    return <Redirect href="/(tabs)" />;
  }

  if (offline) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}
