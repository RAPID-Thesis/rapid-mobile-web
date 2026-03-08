import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { mockAssessments, mockSyncQueue } from '../../mock/assessments';
import { currentUser } from '../../mock/users';

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>  
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const totalAssessments = mockAssessments.length;
  const pendingReview = mockAssessments.filter((a) => a.status === 'pending-review').length;
  const highRisk = mockAssessments.filter(
    (a) => a.aiResult?.fusedClassification.label === 'high' || a.aiResult?.fusedClassification.label === 'UNSAFE'
  ).length;
  const pendingSync = mockSyncQueue.filter((q) => q.status !== 'synced').length;

  const recentAssessments = [...mockAssessments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 3);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Welcome, {currentUser.fullName}</Text>
      <Text style={styles.role}>{currentUser.role.toUpperCase()} &bull; {currentUser.lguCode}</Text>

      <View style={styles.statsRow}>
        <StatCard icon="clipboard" label="Total" value={totalAssessments} color={Colors.primary} />
        <StatCard icon="time" label="Pending" value={pendingReview} color={Colors.warning} />
      </View>
      <View style={styles.statsRow}>
        <StatCard icon="alert-circle" label="High Risk" value={highRisk} color={Colors.error} />
        <StatCard icon="cloud-upload" label="To Sync" value={pendingSync} color={Colors.statusPendingSync} />
      </View>

      <TouchableOpacity
        style={styles.newButton}
        onPress={() => router.push('/assessment/new')}
      >
        <Ionicons name="add-circle" size={24} color="#FFFFFF" />
        <Text style={styles.newButtonText}>New Assessment</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Recent Assessments</Text>
      {recentAssessments.map((a) => {
        const label = a.aiResult?.fusedClassification.label ?? 'N/A';
        const isUnsafe = label === 'UNSAFE' || label === 'high';
        const isRestricted = label === 'RESTRICTED' || label === 'moderate';
        const badgeColor = isUnsafe ? Colors.unsafe : isRestricted ? Colors.restricted : Colors.safe;

        return (
          <TouchableOpacity
            key={a._id}
            style={styles.recentCard}
            onPress={() => router.push(`/assessment/${a._id}`)}
          >
            <View style={styles.recentCardHeader}>
              <Text style={styles.recentCardTitle}>
                {a.buildingId}
              </Text>
              <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                <Text style={styles.badgeText}>{label.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.recentCardMeta}>
              {a.phase === 'pre-earthquake' ? 'Pre-EQ' : 'Post-EQ'} &bull;{' '}
              {new Date(a.createdAt).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  greeting: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  role: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text, marginTop: Spacing.xs },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    height: MinTouchTarget + 8,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.md,
  },
  newButtonText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: '700' },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  recentCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  recentCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentCardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  badgeText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '700' },
  recentCardMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
});
