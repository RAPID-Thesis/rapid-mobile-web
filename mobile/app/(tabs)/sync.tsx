import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import TextBody from '../../components/CustomText';
import { isApiUrlConfigured } from '../../services/api';
import { listOutbox, processOutbox, type OutboxItem } from '../../services/outbox';
import { useAuth } from '../../context/AuthContext';

export default function SyncScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const list = await listOutbox();
    setItems(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        setLoading(true);
        try {
          await load();
        } finally {
          if (!cancelled) setLoading(false);
        }
        // Never block the screen spinner on uploads — fetch can hang without a reachable LAN backend.
        try {
          await processOutbox();
        } finally {
          if (!cancelled) await load();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await processOutbox();
    await load();
    setRefreshing(false);
  }

  async function onSyncNow() {
    if (!session) {
      router.push('/login');
      return;
    }

    setSyncing(true);
    try {
      await processOutbox();
      await load();
    } finally {
      setSyncing(false);
    }
  }

  const queued = items.length;
  const apiReady = isApiUrlConfigured();

  return (
    <View style={styles.container}>
      {!apiReady ? (
        <View style={styles.configWarning}>
          <Ionicons name="warning-outline" size={22} color="#92400E" />
          <View style={styles.configWarningText}>
            <Text style={styles.configWarningTitle}>Backend URL not set</Text>
            <TextBody style={styles.configWarningBody}>
              Add EXPO_PUBLIC_API_URL in mobile/.env (use your dev machine LAN IP and backend port,
              not localhost, on a physical phone). Restart Expo after editing. Without it, nothing
              can reach the server so the web dashboard will stay empty.
            </TextBody>
          </View>
        </View>
      ) : null}
      {apiReady && !session ? (
        <View style={styles.signInBanner}>
          <Ionicons name="cloud-offline-outline" size={22} color="#1E40AF" />
          <View style={styles.signInBannerText}>
            <Text style={styles.signInBannerTitle}>Sign in or sign up to upload</Text>
            <TextBody style={styles.signInBannerBody}>
              Assessments stay saved on this device while offline. Upload starts after an approved
              account signs in.
            </TextBody>
          </View>
        </View>
      ) : null}
      <LinearGradient
        colors={['#1E4E8D', '#143A6B', '#102C50']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.healthCard}
      >
        <Text style={styles.healthTitle}>Sync & upload</Text>
        <Text style={styles.healthMeta}>
          {queued === 0
            ? 'No assessments waiting to upload'
            : `${queued} assessment${queued === 1 ? '' : 's'} queued for the web app`}
        </Text>
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={onSyncNow}
          disabled={syncing || queued === 0}
          activeOpacity={0.85}
        >
          {syncing ? (
            <ActivityIndicator color="#1E4E8D" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#1E4E8D" />
              <Text style={styles.syncBtnText}>{session ? 'Upload now' : 'Sign in to upload'}</Text>
            </>
          )}
        </TouchableOpacity>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-circle" size={48} color={Colors.success} />
          <TextBody style={styles.emptyTitle}>All synced up!</TextBody>
          <TextBody style={styles.emptyBody}>
            New assessments saved offline appear here until they reach the server. They upload
            automatically when you are back online.
          </TextBody>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons
                  name={item.status === 'failed' ? 'warning-outline' : 'phone-portrait-outline'}
                  size={22}
                  color={item.status === 'failed' ? Colors.error : Colors.primary}
                />
              </View>
              <View style={styles.rowBody}>
                <TextBody style={styles.rowTitle}>{item.input.building_code}</TextBody>
                <TextBody style={styles.rowMeta}>
                  Estimate: {item.localPrediction.fusedLabel} ·{' '}
                  {item.status === 'pending'
                    ? !session
                      ? 'Waiting — sign in to upload'
                      : apiReady
                        ? 'Waiting to upload'
                        : 'Blocked — set EXPO_PUBLIC_API_URL'
                    : item.status === 'syncing'
                      ? 'Uploading…'
                      : 'Upload failed — retry'}
                </TextBody>
                {item.lastError ? (
                  <TextBody style={styles.rowErr} selectable numberOfLines={12}>
                    {item.lastError}
                  </TextBody>
                ) : null}
                <TextBody style={styles.rowDate}>
                  {new Date(item.createdAt).toLocaleString()}
                </TextBody>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  configWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  configWarningText: { flex: 1 },
  configWarningTitle: { fontSize: FontSize.sm, fontWeight: '800', color: '#92400E' },
  configWarningBody: { marginTop: 4, fontSize: FontSize.xs, color: '#78350F' },
  signInBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#DBEAFE',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  signInBannerText: { flex: 1 },
  signInBannerTitle: { fontSize: FontSize.sm, fontWeight: '800', color: '#1E3A8A' },
  signInBannerBody: { marginTop: 4, fontSize: FontSize.xs, color: '#1E40AF' },
  healthCard: {
    backgroundColor: Colors.primaryDark,
    margin: Spacing.md,
    marginBottom: 0,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...platformShadow('#0F172A', { width: 0, height: 8 }, 0.2, 12, 5),
  },
  healthTitle: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '800' },
  healthMeta: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: FontSize.xs,
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    minHeight: MinTouchTarget,
  },
  syncBtnText: { color: '#1E4E8D', fontSize: FontSize.sm, fontWeight: '800' },
  listContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...platformShadow('#0F172A', { width: 0, height: 4 }, 0.06, 8, 2),
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  rowMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  rowErr: { fontSize: FontSize.xs, color: Colors.error, marginTop: 4 },
  rowDate: { fontSize: 11, color: Colors.textMuted, marginTop: 6 },
  empty: { alignItems: 'center', marginTop: Spacing.xxl, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: FontSize.lg, color: Colors.text, fontWeight: '700', marginTop: Spacing.sm },
  emptyBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
