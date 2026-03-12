import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { mockSyncQueue } from '../../mock/assessments';
import { SyncQueueItem, SyncStatus } from '../../types';

function getSyncStatusStyle(status: SyncStatus): { icon: string; color: string; label: string } {
  switch (status) {
    case 'queued': return { icon: 'time-outline', color: Colors.textMuted, label: 'Queued' };
    case 'syncing': return { icon: 'sync', color: Colors.primary, label: 'Syncing...' };
    case 'synced': return { icon: 'checkmark-circle', color: Colors.success, label: 'Synced' };
    case 'failed': return { icon: 'alert-circle', color: Colors.error, label: 'Failed' };
  }
}

function SyncItem({ item, onRetry }: { item: SyncQueueItem; onRetry: (queueId: string) => void }) {
  const info = getSyncStatusStyle(item.status);
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Ionicons name={info.icon as any} size={24} color={info.color} />
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>
            Building {item.assessmentPayload.buildingId}
          </Text>
          <Text style={styles.cardMeta}>
            {item.assessmentPayload.phase === 'pre-earthquake' ? 'Pre-EQ' : 'Post-EQ'} &bull;{' '}
            {item.imageFiles.length} image{item.imageFiles.length !== 1 ? 's' : ''}
          </Text>
          {item.attempts > 0 && (
            <Text style={styles.cardAttempts}>
              {item.attempts} attempt{item.attempts !== 1 ? 's' : ''}
              {item.lastAttemptAt ? ` · Last: ${new Date(item.lastAttemptAt).toLocaleTimeString()}` : ''}
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: info.color }]}>
          <Text style={styles.statusText}>{info.label}</Text>
        </View>
      </View>

      {item.status === 'failed' && (
        <TouchableOpacity style={styles.retryButton} onPress={() => onRetry(item.queueId)} activeOpacity={0.85}>
          <Ionicons name="refresh" size={16} color={Colors.primary} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SyncScreen() {
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [retryingQueueId, setRetryingQueueId] = useState<string | null>(null);

  const queuedCount = mockSyncQueue.filter((q) => q.status === 'queued').length;
  const syncingCount = mockSyncQueue.filter((q) => q.status === 'syncing').length;
  const failedCount = mockSyncQueue.filter((q) => q.status === 'failed').length;
  const syncedCount = mockSyncQueue.filter((q) => q.status === 'synced').length;
  const pendingCount = queuedCount + syncingCount + failedCount;
  const completionRate = mockSyncQueue.length
    ? Math.round((syncedCount / mockSyncQueue.length) * 100)
    : 100;
  const healthMessage = useMemo(() => {
    if (pendingCount === 0) return 'Up to date';
    if (failedCount > 0) return `${failedCount} failed item${failedCount > 1 ? 's' : ''}`;
    return `${pendingCount} item${pendingCount > 1 ? 's' : ''} pending`;
  }, [failedCount, pendingCount]);

  const handleSyncNow = () => {
    if (isSyncingNow) return;
    setIsSyncingNow(true);
    setTimeout(() => {
      setIsSyncingNow(false);
      setLastSyncedAt(new Date());
    }, 900);
  };

  const handleRetry = (queueId: string) => {
    setRetryingQueueId(queueId);
    setTimeout(() => {
      setRetryingQueueId(null);
      setLastSyncedAt(new Date());
    }, 700);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1E4E8D', '#143A6B', '#102C50']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.healthCard}
      >
        <Text style={styles.healthTitle}>Sync Health</Text>
        <Text style={styles.healthMeta}>
          {completionRate}% completed • {healthMessage}
        </Text>
        <View style={styles.syncActionRow}>
          <TouchableOpacity
            style={[styles.syncNowButton, isSyncingNow && styles.syncNowButtonDisabled]}
            onPress={handleSyncNow}
            disabled={isSyncingNow}
            activeOpacity={0.85}
          >
            {isSyncingNow ? (
              <View style={styles.syncNowLoading}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.syncNowText}>Syncing...</Text>
              </View>
            ) : (
              <Text style={styles.syncNowText}>Sync now</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.syncTimestamp}>
            {lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleTimeString()}` : 'No sync run this session'}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${completionRate}%` }]} />
        </View>
      </LinearGradient>

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: Colors.textMuted }]}>{queuedCount}</Text>
          <Text style={styles.summaryLabel}>Queued</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: Colors.primary }]}>{syncingCount}</Text>
          <Text style={styles.summaryLabel}>Syncing</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: Colors.error }]}>{failedCount}</Text>
          <Text style={styles.summaryLabel}>Failed</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: Colors.success }]}>{syncedCount}</Text>
          <Text style={styles.summaryLabel}>Synced</Text>
        </View>
      </View>

      <FlatList
        data={mockSyncQueue}
        keyExtractor={(item) => item.queueId}
        renderItem={({ item }) => (
          <View>
            <SyncItem item={item} onRetry={handleRetry} />
            {retryingQueueId === item.queueId ? (
              <Text style={styles.retryingText}>Retrying item...</Text>
            ) : null}
          </View>
        )}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle" size={48} color={Colors.success} />
            <Text style={styles.emptyText}>All synced up!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  healthCard: {
    backgroundColor: Colors.primaryDark,
    margin: Spacing.md,
    marginBottom: 0,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  healthTitle: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '800' },
  healthMeta: { color: 'rgba(255,255,255,0.86)', fontSize: FontSize.xs, marginTop: 2, marginBottom: Spacing.sm },
  syncActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  syncNowButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  syncNowButtonDisabled: {
    opacity: 0.75,
  },
  syncNowText: { color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '700' },
  syncNowLoading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncTimestamp: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: FontSize.xs,
    flex: 1,
    textAlign: 'right',
  },
  progressTrack: { width: '100%', height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.26)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#FFFFFF' },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    margin: Spacing.md,
    marginBottom: 0,
    borderRadius: BorderRadius.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: FontSize.xl, fontWeight: '800' },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  cardMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  cardAttempts: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.sm },
  statusText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '700' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.sm,
    height: MinTouchTarget,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
  },
  retryText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  retryingText: {
    marginTop: 6,
    marginLeft: Spacing.sm,
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  empty: { alignItems: 'center', marginTop: Spacing.xxl },
  emptyText: { fontSize: FontSize.lg, color: Colors.textSecondary, marginTop: Spacing.sm },
});
