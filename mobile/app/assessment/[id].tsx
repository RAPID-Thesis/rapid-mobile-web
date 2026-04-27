import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import { supabase } from '../../services/supabase';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DataRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{String(value)}</Text>
    </View>
  );
}

export default function AssessmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [assessment, setAssessment] = useState<any>(null);
  const [building, setBuilding] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: aData } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', id)
        .single();

      if (aData?.building_id) {
        const { data: bData } = await supabase
          .from('buildings')
          .select('*')
          .eq('id', aData.building_id)
          .single();
        setBuilding(bData);
      }

      setAssessment(aData);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!assessment) {
    return (
      <View style={styles.center}>
        <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.errorText}>Assessment not found</Text>
      </View>
    );
  }

  const classLabel = assessment.ai_fused_label ?? 'Pending';
  const confidence = assessment.ai_fused_confidence;
  const lowerLabel = classLabel.toLowerCase();
  const isUnsafe = lowerLabel === 'unsafe' || lowerLabel === 'high';
  const isRestricted = lowerLabel === 'restricted' || lowerLabel === 'moderate';
  const isPending = lowerLabel === 'pending';
  const badgeColor = isUnsafe
    ? Colors.unsafe
    : isRestricted
      ? Colors.restricted
      : isPending
        ? Colors.statusPendingReview
        : Colors.safe;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[
          badgeColor,
          isUnsafe ? '#7F1D1D' : isRestricted ? '#92400E' : isPending ? '#B45309' : '#166534',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <Ionicons
          name={isUnsafe ? 'alert-circle' : isRestricted || isPending ? 'warning' : 'checkmark-circle'}
          size={32}
          color="#FFF"
        />
        <View>
          <Text style={styles.bannerLabel}>{classLabel.toUpperCase()}</Text>
          <Text style={styles.bannerConf}>
            {confidence != null ? `${(confidence * 100).toFixed(0)}% confidence` : 'No AI result yet'}
          </Text>
        </View>
        {assessment.priority_score != null && (
          <View style={styles.priorityBadge}>
            <Text style={styles.priorityText}>Priority: {assessment.priority_score}</Text>
          </View>
        )}
      </LinearGradient>

      <SectionCard title="Building Information">
        <DataRow label="Code" value={building?.building_code ?? '—'} />
        <DataRow label="Address" value={building?.address ?? '—'} />
        <DataRow label="Barangay" value={building?.barangay ?? '—'} />
        <DataRow label="Use" value={building?.building_use ?? '—'} />
        <DataRow label="Stories" value={building?.number_of_stories ?? '—'} />
        <DataRow label="Year Built" value={building?.year_built ?? '—'} />
        <DataRow label="Soil Class" value={building?.soil_classification ?? '—'} />
      </SectionCard>

      <SectionCard title="Assessment Details">
        <DataRow label="Phase" value={assessment.phase === 'pre-earthquake' ? 'Pre-Earthquake' : 'Post-Earthquake'} />
        <DataRow label="Status" value={assessment.status ?? '—'} />
        <DataRow label="Created" value={new Date(assessment.created_at).toLocaleDateString()} />
      </SectionCard>

      {assessment.action_plan_text && (
        <SectionCard title="Action Plan">
          <Text style={styles.actionText}>{assessment.action_plan_text}</Text>
        </SectionCard>
      )}

      <SectionCard title="Engineer Review">
        {assessment.review_engineer_id ? (
          <View>
            <DataRow label="Status" value="Reviewed" />
            {assessment.review_override_label && (
              <DataRow label="Override" value={assessment.review_override_label} />
            )}
            {assessment.review_justification && (
              <DataRow label="Justification" value={assessment.review_justification} />
            )}
          </View>
        ) : (
          <View style={styles.pendingReview}>
            <Ionicons name="time" size={24} color={Colors.warning} />
            <Text style={styles.pendingText}>Awaiting engineer review</Text>
          </View>
        )}
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing.xl, paddingTop: Spacing.sm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  errorText: { fontSize: FontSize.lg, color: Colors.textMuted, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    ...platformShadow('#0F172A', { width: 0, height: 8 }, 0.2, 12, 5),
  },
  bannerLabel: { color: '#FFF', fontSize: FontSize.xl, fontWeight: '800' },
  bannerConf: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm },
  priorityBadge: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(0,0,0,0.24)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  priorityText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '700' },
  section: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...platformShadow('#0F172A', { width: 0, height: 4 }, 0.05, 8, 2),
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dataLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  dataValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, maxWidth: '60%', textAlign: 'right' },
  actionText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  pendingReview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: '#FFFBEB', borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: '#FDE68A' },
  pendingText: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '500' },
});
