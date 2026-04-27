import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import { supabase } from '../../services/supabase';

/** Must match `tabBarStyle` in `(tabs)/_layout.tsx` (floating bar). */
const TAB_BAR_MARGIN_BOTTOM = 8;
const TAB_BAR_HEIGHT = 68;
const FAB_SIZE = 56;
const FAB_GAP_ABOVE_TAB = 12;
const LIST_GAP_BELOW_FAB = Spacing.md;

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
  if (lower === 'pending') return Colors.statusPendingReview;
  return Colors.safe;
}

type PhaseFilter = 'all' | 'pre-earthquake' | 'post-earthquake';

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
  const insets = useSafeAreaInsets();
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');

  const tabBarStack =
    TAB_BAR_MARGIN_BOTTOM + TAB_BAR_HEIGHT + FAB_GAP_ABOVE_TAB + FAB_SIZE + LIST_GAP_BELOW_FAB;
  const fabBottom = TAB_BAR_MARGIN_BOTTOM + TAB_BAR_HEIGHT + FAB_GAP_ABOVE_TAB;
  const listPaddingBottom = insets.bottom + tabBarStack;

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

  const filteredAssessments = useMemo(() => {
    if (phaseFilter === 'all') return assessments;
    return assessments.filter((a) => a.phase === phaseFilter);
  }, [assessments, phaseFilter]);

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredAssessments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AssessmentCard item={item} buildings={buildings} />}
        contentContainerStyle={[styles.list, { paddingBottom: listPaddingBottom }]}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          !loading && assessments.length > 0 && filteredAssessments.length === 0 ? (
            <View style={styles.filterEmpty}>
              <Ionicons name="funnel-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.filterEmptyTitle}>No matches</Text>
              <Text style={styles.filterEmptyBody}>
                {phaseFilter === 'pre-earthquake'
                  ? 'No Pre-Earthquake assessments. Try Post or All.'
                  : phaseFilter === 'post-earthquake'
                    ? 'No Post-Earthquake assessments. Try Pre or All.'
                    : ''}
              </Text>
              <TouchableOpacity onPress={() => setPhaseFilter('all')} activeOpacity={0.85}>
                <Text style={styles.filterEmptyLink}>Show all</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View>
            <LinearGradient
              colors={['#FFFFFF', '#F8FAFC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerCard}
            >
              <View>
                <Text style={styles.headerTitle}>Assessment Queue</Text>
                <Text style={styles.header}>{assessments.length} total records</Text>
              </View>
              {assessments.length > 0 && (
                <>
                  <View style={styles.filterRow}>
                    <TouchableOpacity
                      style={[styles.filterChip, phaseFilter === 'all' && styles.filterChipActive]}
                      onPress={() => setPhaseFilter('all')}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          phaseFilter === 'all' && styles.filterChipTextActive,
                        ]}
                      >
                        All ({assessments.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterChip, phaseFilter === 'pre-earthquake' && styles.filterChipActive]}
                      onPress={() => setPhaseFilter('pre-earthquake')}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          phaseFilter === 'pre-earthquake' && styles.filterChipTextActive,
                        ]}
                      >
                        Pre ({preEqCount})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterChip, phaseFilter === 'post-earthquake' && styles.filterChipActive]}
                      onPress={() => setPhaseFilter('post-earthquake')}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          phaseFilter === 'post-earthquake' && styles.filterChipTextActive,
                        ]}
                      >
                        Post ({postEqCount})
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {urgentCount > 0 && (
                    <View style={styles.summaryChips}>
                      <View style={[styles.summaryChip, styles.summaryChipUrgent]}>
                        <Text style={[styles.summaryChipText, styles.summaryChipUrgentText]}>
                          Urgent {urgentCount}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
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
        style={[styles.fab, { bottom: insets.bottom + fabBottom }]}
        onPress={() => router.push('/assessment/new')}
        accessibilityLabel="New assessment"
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  headerCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...platformShadow('#0F172A', { width: 0, height: 4 }, 0.06, 8, 2),
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  header: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  filterChip: {
    backgroundColor: Colors.surfaceSoft,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  filterChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '700' },
  filterChipTextActive: { color: '#FFFFFF' },
  filterEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  filterEmptyTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm },
  filterEmptyBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  filterEmptyLink: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primaryDark },
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
    ...platformShadow('#0F172A', { width: 0, height: 4 }, 0.05, 7, 2),
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
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    ...platformShadow('#000000', { width: 0, height: 2 }, 0.32, 8, 4),
  },
});
