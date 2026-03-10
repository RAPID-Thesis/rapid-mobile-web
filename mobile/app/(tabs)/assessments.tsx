import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { mockAssessments } from '../../mock/assessments';
import { mockBuildings } from '../../mock/buildings';
import { Assessment } from '../../types';

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

function AssessmentCard({ item }: { item: Assessment }) {
  const building = mockBuildings.find((b) => b._id === item.buildingId);
  const classification = item.aiResult?.fusedClassification.label ?? 'N/A';
  const confidence = item.aiResult?.fusedClassification.confidence;
  const statusInfo = getStatusInfo(item.status);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/assessment/${item._id}`)}
    >
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.cardCode}>{building?.buildingCode ?? item.buildingId}</Text>
          <Text style={styles.cardAddress} numberOfLines={1}>
            {building?.address ?? 'Unknown'}
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
  const sorted = [...mockAssessments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <AssessmentCard item={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListHeaderComponent={
          <Text style={styles.header}>{sorted.length} assessments</Text>
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
  header: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
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
  fab: {
    position: 'absolute',
    bottom: Spacing.lg,
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
