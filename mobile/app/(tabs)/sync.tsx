import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

function SyncItem({ item }: { item: SyncQueueItem }) {
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
        <TouchableOpacity style={styles.retryButton}>
          <Ionicons name="refresh" size={16} color={Colors.primary} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SyncScreen() {
  const queuedCount = mockSyncQueue.filter((q) => q.status === 'queued').length;
  const syncingCount = mockSyncQueue.filter((q) => q.status === 'syncing').length;
  const failedCount = mockSyncQueue.filter((q) => q.status === 'failed').length;
  const syncedCount = mockSyncQueue.filter((q) => q.status === 'synced').length;

  return (
    <View style={styles.container}>
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
        renderItem={({ item }) => <SyncItem item={item} />}
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
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: FontSize.xl, fontWeight: '800' },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
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
  empty: { alignItems: 'center', marginTop: Spacing.xxl },
  emptyText: { fontSize: FontSize.lg, color: Colors.textSecondary, marginTop: Spacing.sm },
});
