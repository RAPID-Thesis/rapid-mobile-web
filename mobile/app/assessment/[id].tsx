import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { mockAssessments } from '../../mock/assessments';
import { mockBuildings } from '../../mock/buildings';

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

function ConfidenceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.confRow}>
      <Text style={styles.confLabel}>{label}</Text>
      <View style={styles.confBarBg}>
        <View style={[styles.confBarFill, { width: `${value * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.confValue}>{(value * 100).toFixed(0)}%</Text>
    </View>
  );
}

export default function AssessmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assessment = mockAssessments.find((a) => a._id === id);
  const building = assessment ? mockBuildings.find((b) => b._id === assessment.buildingId) : null;

  if (!assessment) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Assessment not found</Text>
      </View>
    );
  }

  const fused = assessment.aiResult?.fusedClassification;
  const classLabel = fused?.label ?? 'N/A';
  const isUnsafe = classLabel === 'UNSAFE' || classLabel === 'high';
  const isRestricted = classLabel === 'RESTRICTED' || classLabel === 'moderate';
  const badgeColor = isUnsafe ? Colors.unsafe : isRestricted ? Colors.restricted : Colors.safe;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Classification Banner */}
      <LinearGradient
        colors={[
          badgeColor,
          classLabel === 'UNSAFE' || classLabel === 'high'
            ? '#7F1D1D'
            : classLabel === 'RESTRICTED' || classLabel === 'moderate'
              ? '#92400E'
              : '#166534',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <Ionicons
          name={isUnsafe ? 'alert-circle' : isRestricted ? 'warning' : 'checkmark-circle'}
          size={32}
          color="#FFF"
        />
        <View>
          <Text style={styles.bannerLabel}>{classLabel.toUpperCase()}</Text>
          <Text style={styles.bannerConf}>
            {fused ? `${(fused.confidence * 100).toFixed(0)}% confidence` : 'No AI result'}
          </Text>
        </View>
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityText}>Priority: {assessment.priorityScore}</Text>
        </View>
      </LinearGradient>

      {/* Building Info */}
      <SectionCard title="Building Information">
        <DataRow label="Code" value={building?.buildingCode ?? assessment.buildingId} />
        <DataRow label="Address" value={building?.address ?? 'N/A'} />
        <DataRow label="Barangay" value={building?.barangay ?? 'N/A'} />
        <DataRow label="Use" value={building?.buildingUse ?? 'N/A'} />
        <DataRow label="Stories" value={building?.numberOfStories ?? 'N/A'} />
        <DataRow label="Year Built" value={building?.yearBuilt ?? 'N/A'} />
        <DataRow label="Soil Class" value={building?.soilClassification ?? 'N/A'} />
      </SectionCard>

      {/* Photos */}
      <SectionCard title={`Photos (${assessment.images.length})`}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          {assessment.images.map((img, i) => (
            <View key={i} style={styles.photoCard}>
              <Image source={{ uri: img.url }} style={styles.photo} />
              <Text style={styles.photoAngle}>{img.angle}</Text>
            </View>
          ))}
        </ScrollView>
      </SectionCard>

      {/* AI Results */}
      {assessment.aiResult && (
        <SectionCard title="AI Classification Results">
          <Text style={styles.subTitle}>Image Branch (ResNet50)</Text>
          {Object.entries(assessment.aiResult.imageClassification.probabilities).map(([k, v]) => (
            <ConfidenceBar key={k} label={k.toUpperCase()} value={v as number} color={
              k === 'UNSAFE' || k === 'high' ? Colors.unsafe :
              k === 'RESTRICTED' || k === 'moderate' ? Colors.restricted : Colors.safe
            } />
          ))}

          <Text style={[styles.subTitle, { marginTop: Spacing.md }]}>Tabular Branch (Random Forest)</Text>
          {Object.entries(assessment.aiResult.tabularClassification.probabilities).map(([k, v]) => (
            <ConfidenceBar key={k} label={k.toUpperCase()} value={v as number} color={
              k === 'UNSAFE' || k === 'high' ? Colors.unsafe :
              k === 'RESTRICTED' || k === 'moderate' ? Colors.restricted : Colors.safe
            } />
          ))}

          <Text style={[styles.subTitle, { marginTop: Spacing.md }]}>
            Fused Result (Image {(assessment.aiResult.fusionWeights.image * 100).toFixed(0)}% / Tabular {(assessment.aiResult.fusionWeights.tabular * 100).toFixed(0)}%)
          </Text>
          <LinearGradient
            colors={[
              badgeColor,
              classLabel === 'UNSAFE' || classLabel === 'high'
                ? '#7F1D1D'
                : classLabel === 'RESTRICTED' || classLabel === 'moderate'
                  ? '#92400E'
                  : '#166534',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fusedBadge}
          >
            <Text style={styles.fusedText}>
              {classLabel.toUpperCase()} — {fused ? (fused.confidence * 100).toFixed(1) : 0}%
            </Text>
          </LinearGradient>
        </SectionCard>
      )}

      {/* Action Plan */}
      {assessment.actionPlan && (
        <SectionCard title="Action Plan">
          <Text style={styles.actionSource}>
            Generated by: {assessment.actionPlan.generatedBy === 'gemini' ? 'Gemini AI' : 'Template Fallback'}
          </Text>
          {assessment.actionPlan.recommendations.map((rec, i) => (
            <View key={i} style={styles.actionItem}>
              <Text style={styles.actionNum}>{i + 1}</Text>
              <Text style={styles.actionText}>{rec}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* Engineer Review */}
      <SectionCard title="Engineer Review">
        {assessment.engineerReview.reviewedBy ? (
          <View>
            <DataRow label="Status" value="Reviewed" />
            <DataRow label="Reviewed At" value={new Date(assessment.engineerReview.reviewedAt!).toLocaleString()} />
            {assessment.engineerReview.overrideClassification && (
              <>
                <DataRow label="Override" value={assessment.engineerReview.overrideClassification} />
                <DataRow label="Justification" value={assessment.engineerReview.justification ?? 'N/A'} />
              </>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: FontSize.lg, color: Colors.error },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
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
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm },
  subTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.xs },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dataLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  dataValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, maxWidth: '60%', textAlign: 'right' },
  photoScroll: { marginTop: Spacing.xs },
  photoCard: { marginRight: Spacing.sm, alignItems: 'center' },
  photo: { width: 120, height: 90, borderRadius: BorderRadius.sm, backgroundColor: Colors.border, borderWidth: 1, borderColor: Colors.borderStrong },
  photoAngle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  confLabel: { width: 90, fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  confBarBg: { flex: 1, height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden' },
  confBarFill: { height: '100%', borderRadius: 5 },
  confValue: { width: 36, fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  fusedBadge: { padding: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  fusedText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '800' },
  actionSource: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  actionItem: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm, alignItems: 'flex-start' },
  actionNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primaryDark, color: '#FFF', fontSize: FontSize.xs, fontWeight: '700', textAlign: 'center', lineHeight: 24, overflow: 'hidden' },
  actionText: { flex: 1, fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  pendingReview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: '#FFFBEB', borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: '#FDE68A' },
  pendingText: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '500' },
});
