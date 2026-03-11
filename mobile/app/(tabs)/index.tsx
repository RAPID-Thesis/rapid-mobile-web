import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { mockAssessments, mockSyncQueue } from '../../mock/assessments';
import { currentUser } from '../../mock/users';

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>  
      <View style={[styles.statIconWrap, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
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
      <LinearGradient
        colors={['#1E4E8D', '#153A69', '#0F294A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <Text style={styles.heroEyebrow}>RAPID FIELD OPERATIONS</Text>
        <Text style={styles.greeting}>Welcome, {currentUser.fullName}</Text>
        <Text style={styles.role}>{currentUser.role.toUpperCase()} &bull; {currentUser.lguCode}</Text>
        <View style={styles.heroPills}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>Offline-First Capture</Text>
          </View>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>AI-Assisted Triage</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.statsRow}>
        <StatCard icon="clipboard" label="Total" value={totalAssessments} color={Colors.primary} />
        <StatCard icon="time" label="Pending" value={pendingReview} color={Colors.warning} />
      </View>
      <View style={styles.statsRow}>
        <StatCard icon="alert-circle" label="High Risk" value={highRisk} color={Colors.error} />
        <StatCard icon="cloud-upload" label="To Sync" value={pendingSync} color={Colors.statusPendingSync} />
      </View>

      <TouchableOpacity style={styles.newButton} onPress={() => router.push('/assessment/new')}>
        <LinearGradient
          colors={['#1E4E8D', '#143A6B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.newButtonGradient}
        >
          <Ionicons name="add-circle" size={24} color="#FFFFFF" />
          <Text style={styles.newButtonText}>New Assessment</Text>
        </LinearGradient>
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
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  heroCard: {
    backgroundColor: Colors.primaryDark,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 7,
  },
  heroEyebrow: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.7, fontWeight: '700' },
  greeting: { fontSize: FontSize.xl, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },
  role: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  heroPillText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text, marginTop: Spacing.xs },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  newButton: {
    height: MinTouchTarget + 8,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.md,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  newButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  newButtonText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: '700' },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  recentCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  recentCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentCardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  badgeText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '700' },
  recentCardMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
});
