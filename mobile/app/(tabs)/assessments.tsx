import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { supabase } from '../../services/supabase';

interface AssessmentRow {
  id: string;
  building_id: string;
  phase: string;
  status: string;
  ai_fused_label: string | null;
  ai_fused_confidence: number | null;
  priority_score: number;
  created_at: string;
}

interface BuildingRow {
  id: string;
  building_code: string;
  address: string;
}

function getClassificationColor(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'unsafe' || lower === 'high') return Colors.unsafe;
  if (lower === 'restricted' || lower === 'moderate') return Colors.restricted;
  return Colors.safe;
}

function getStatusInfo(status: string): { label: string; color: string } {
  switch (status) {
    case 'pending-sync': return { label: 'Pending Sync', color: Colors.statusPendingSync };
    case 'pending-review': return { label: 'Pending Review', color: Colors.statusPendingReview };
    case 'reviewed': return { label: 'Reviewed', color: Colors.statusReviewed };
    case 'report-generated': return { label: 'Report Generated', color: Colors.statusReportGenerated };
    default: return { label: status, color: Colors.textMuted };
  }
}

function AssessmentCard({ item, buildings }: { item: AssessmentRow; buildings: BuildingRow[] }) {
  const building = buildings.find((b) => b.id === item.building_id);
  const classification = item.ai_fused_label ?? 'Pending';
  const confidence = item.ai_fused_confidence;
  const statusInfo = getStatusInfo(item.status);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/assessment/${item.id}`)}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.cardCode}>{building?.building_code ?? '—'}</Text>
          <Text style={styles.cardAddress} numberOfLines={1}>
            {building?.address ?? '—'}
          </Text>
        </View>
        <View style={[styles.classBadge, { backgroundColor: getClassificationColor(classification) }]}>
          <Text style={styles.classBadgeText}>{classification.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.metaRow}>
          <Ionicons name={item.phase === 'pre-earthquake' ? 'shield-checkmark' : 'warning'} size={14} color={Colors.textSecondary} />
          <Text style={styles.metaText}>
            {item.phase === 'pre-earthquake' ? 'Pre-EQ' : 'Post-EQ'}
          </Text>
        </View>
        {confidence != null && (
          <Text style={styles.metaText}>{(confidence * 100).toFixed(0)}% conf.</Text>
        )}
        <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
        <Text style={[styles.metaText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function AssessmentsScreen() {
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [aRes, bRes] = await Promise.all([
        supabase.from('assessments').select('id, building_id, phase, status, ai_fused_label, ai_fused_confidence, priority_score, created_at').order('created_at', { ascending: false }),
        supabase.from('buildings').select('id, building_code, address'),
      ]);
      setAssessments((aRes.data as AssessmentRow[]) ?? []);
      setBuildings((bRes.data as BuildingRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const preEqCount = assessments.filter((a) => a.phase === 'pre-earthquake').length;
  const postEqCount = assessments.filter((a) => a.phase === 'post-earthquake').length;
  const urgentCount = assessments.filter((a) => a.priority_score >= 80).length;

  return (
    <View style={styles.container}>
      <FlatList
        data={assessments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AssessmentCard item={item} buildings={buildings} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListHeaderComponent={
          <View>
            <LinearGradient
              colors={['#FFFFFF', '#F8FAFC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerCard}
            >
              <View style={styles.headerTopRow}>
                <View style={styles.headerInfo}>
                  <Text style={styles.headerTitle}>Assessment Queue</Text>
                  <Text style={styles.header}>{assessments.length} total records</Text>
                </View>
                <TouchableOpacity
                  style={styles.headerAction}
                  onPress={() => router.push('/assessment/new')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.headerActionText}>New</Text>
                </TouchableOpacity>
              </View>
              {assessments.length > 0 && (
                <View style={styles.summaryChips}>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipText}>Pre-EQ {preEqCount}</Text>
                  </View>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipText}>Post-EQ {postEqCount}</Text>
                  </View>
                  {urgentCount > 0 && (
                    <View style={[styles.summaryChip, styles.summaryChipUrgent]}>
                      <Text style={[styles.summaryChipText, styles.summaryChipUrgentText]}>Urgent {urgentCount}</Text>
                    </View>
                  )}
                </View>
              )}
            </LinearGradient>
            {loading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: Spacing.xl }} />
            ) : assessments.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="clipboard-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No assessments yet</Text>
                <Text style={styles.emptyBody}>
                  Start your first field record to build your assessment queue.
                </Text>
                <TouchableOpacity
                  style={styles.emptyAction}
                  onPress={() => router.push('/assessment/new')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyActionText}>Start Assessment</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/assessment/new')}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.md },
  headerCard: {
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
  headerTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  header: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerInfo: { flex: 1 },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryDark,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  headerActionText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '700' },
  summaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  summaryChip: {
    backgroundColor: Colors.surfaceSoft,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  summaryChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  summaryChipUrgent: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  summaryChipUrgentText: { color: Colors.error },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 7,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardCode: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  cardAddress: { fontSize: FontSize.sm, color: Colors.textSecondary, maxWidth: 220, marginTop: 2 },
  classBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.sm },
  classBadgeText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  emptyState: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  emptyBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  emptyAction: {
    backgroundColor: Colors.primaryDark,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  emptyActionText: { color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '700' },
  fab: {
    position: 'absolute',
    bottom: Spacing.lg,
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
  },
});
