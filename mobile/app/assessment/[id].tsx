import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import { supabase } from '../../services/supabase';
import {
  getOutboxItem,
  isMissingGps,
  processOutbox,
  updateOutboxGps,
  type OutboxItem,
} from '../../services/outbox';
import { isServerAssessmentId } from '../../services/localAssessments';
import { formatPercent } from '../../utils/formatPercent';
import { getCurrentFix, requestLocationPermission } from '../../services/location';

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

function badgeColors(label: string) {
  const lower = label.toLowerCase();
  const isUnsafe = lower === 'unsafe' || lower === 'high';
  const isRestricted = lower === 'restricted' || lower === 'moderate';
  const isPending = lower === 'pending';
  const badgeColor = isUnsafe
    ? Colors.unsafe
    : isRestricted
      ? Colors.restricted
      : isPending
        ? Colors.statusPendingReview
        : Colors.safe;
  const gradientEnd = isUnsafe
    ? '#7F1D1D'
    : isRestricted
      ? '#92400E'
      : isPending
        ? '#B45309'
        : '#166534';
  return { isUnsafe, isRestricted, isPending, badgeColor, gradientEnd };
}

function LocalAssessmentDetail({ item: initialItem }: { item: OutboxItem }) {
  const [item, setItem] = useState(initialItem);
  const [gpsBusy, setGpsBusy] = useState(false);

  useEffect(() => {
    setItem(initialItem);
  }, [initialItem]);

  const classLabel = item.localPrediction.fusedLabel;
  const confidence = item.localPrediction.fusedConfidence;
  const { isUnsafe, isRestricted, isPending, badgeColor, gradientEnd } = badgeColors(classLabel);
  const recommendations = item.localActionPlan?.recommendations ?? [];
  const structural = item.input.structural_data ?? {};
  const soilClass =
    typeof structural.soilClass === 'string' ? structural.soilClass : '—';
  const missingGps = isMissingGps(item);
  const hasCoords = !missingGps;

  const syncLabel =
    item.status === 'pending'
      ? missingGps
        ? 'Waiting for GPS — capture below before upload'
        : 'Queued — upload when online'
      : item.status === 'syncing'
        ? 'Uploading…'
        : missingGps
          ? 'Upload blocked — capture GPS below'
          : 'Upload failed — retry from Sync tab';

  async function handleCaptureGps() {
    setGpsBusy(true);
    try {
      const permission = await requestLocationPermission();
      if (!permission.granted) {
        Alert.alert(
          'Location permission needed',
          permission.canAskAgain
            ? 'Allow location access to attach GPS coordinates to this assessment.'
            : 'Location is blocked. Open Settings to enable it for RADAR.',
          permission.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open settings', onPress: () => void Linking.openSettings() },
              ]
        );
        return;
      }

      const fix = await getCurrentFix();
      if (!fix) {
        Alert.alert(
          'GPS unavailable',
          'Could not get a fix. Move to an open area with a clear sky view and try again.'
        );
        return;
      }

      const updated = await updateOutboxGps(item.id, fix);
      if (!updated) {
        Alert.alert('Update failed', 'Could not save GPS on this assessment.');
        return;
      }

      setItem(updated);
      void processOutbox();
      Alert.alert(
        'GPS captured',
        `Coordinates saved (${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}). Upload will retry when online.`
      );
    } finally {
      setGpsBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.provenanceBanner}>
        <Ionicons name="phone-portrait-outline" size={16} color={Colors.primaryDark} />
        <Text style={styles.provenanceText}>Field assessment (device) — works offline</Text>
      </View>

      {missingGps ? (
        <View style={styles.gpsFixBanner}>
          <Ionicons name="location-outline" size={22} color="#92400E" />
          <View style={styles.gpsFixText}>
            <Text style={styles.gpsFixTitle}>GPS coordinates missing</Text>
            <Text style={styles.gpsFixBody}>
              This assessment was saved without GPS. Capture your current location to enable upload
              and heatmap placement.
            </Text>
            {item.lastError ? (
              <Text style={styles.gpsFixErr} selectable>
                {item.lastError}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.gpsFixBtn}
              onPress={() => void handleCaptureGps()}
              disabled={gpsBusy}
              activeOpacity={0.85}
            >
              {gpsBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="navigate-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.gpsFixBtnText}>Capture GPS now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <LinearGradient
        colors={[badgeColor, gradientEnd]}
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
          <Text style={styles.bannerConf}>{formatPercent(confidence, 0)} confidence</Text>
        </View>
        {item.localPriorityScore != null && (
          <View style={styles.priorityBadge}>
            <Text style={styles.priorityText}>
              Priority: {formatPercent(item.localPriorityScore, 0)}
            </Text>
          </View>
        )}
      </LinearGradient>

      <SectionCard title="Building Information">
        <DataRow label="Code" value={item.input.building_code} />
        <DataRow label="Address" value={item.input.address} />
        <DataRow label="Barangay" value={item.input.barangay} />
        <DataRow label="Use" value={item.input.building_use} />
        <DataRow label="Stories" value={item.input.number_of_stories} />
        <DataRow label="Year Built" value={item.input.year_built ?? '—'} />
        <DataRow label="Soil Class" value={soilClass} />
        <DataRow label="Distance to Fault" value={faultDistanceLabel(structural)} />
      </SectionCard>

      <SectionCard title="Assessment Details">
        <DataRow
          label="Phase"
          value={item.input.phase === 'pre-earthquake' ? 'Pre-Earthquake' : 'Post-Earthquake'}
        />
        <DataRow label="Sync" value={syncLabel} />
        <DataRow
          label="GPS"
          value={
            hasCoords
              ? `${item.input.latitude.toFixed(6)}, ${item.input.longitude.toFixed(6)}`
              : 'Not captured'
          }
        />
        {hasCoords ? (
          <TouchableOpacity style={styles.gpsRefreshLink} onPress={() => void handleCaptureGps()} disabled={gpsBusy}>
            <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
            <Text style={styles.gpsRefreshLinkText}>
              {gpsBusy ? 'Updating location…' : 'Update GPS location'}
            </Text>
          </TouchableOpacity>
        ) : null}
        <DataRow label="Created" value={new Date(item.createdAt).toLocaleString()} />
        <DataRow label="Photos" value={item.input.imageUris?.length ?? 0} />
      </SectionCard>

      <SectionCard title="Risk Breakdown">
        <DataRow
          label="Source"
          value={
            item.localPrediction.source === 'device-ml-fusion'
              ? 'Device ML fusion'
              : 'Heuristic fallback'
          }
        />
        {item.localPrediction.imageLabel != null && (
          <DataRow
            label="Image (ResNet)"
            value={`${item.localPrediction.imageLabel} (${formatPercent(item.localPrediction.imageConfidence ?? 0, 0)})`}
          />
        )}
        <DataRow
          label="Tabular (RF)"
          value={`${item.localPrediction.tabularLabel} (${formatPercent(item.localPrediction.tabularConfidence, 0)})`}
        />
        {Object.entries(item.localPrediction.probabilities).map(([label, value]) => (
          <DataRow key={label} label={`Fused ${label.toUpperCase()}`} value={formatPercent(value)} />
        ))}
      </SectionCard>

      {recommendations.length > 0 && (
        <SectionCard title="Action Plan">
          {recommendations.map((rec, i) => (
            <View key={i} style={styles.actionRow}>
              <Text style={styles.actionBullet}>{i + 1}.</Text>
              <Text style={styles.actionText}>{rec}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      <SectionCard title="After Upload">
        <View style={styles.pendingReview}>
          <Ionicons name="cloud-upload-outline" size={24} color={Colors.primary} />
          <Text style={styles.uploadHint}>
            When connectivity returns, this record uploads for full ML fusion and engineer review
            on the web portal. Your field result stays available here until then.
          </Text>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

/**
 * Fault distance recorded for this assessment, in km.
 *
 * The value comes from the bundled PHIVOLCS Valley Fault System trace, sampled at
 * the GPS fix the same way the Random Forest samples it, so what an inspector sees
 * here is the number the model actually scored.
 */
function faultDistanceLabel(
  structural: Record<string, unknown>,
  buildingValue?: unknown,
): string {
  const raw = structural.distance_to_fault_km ?? buildingValue;
  const km = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof km !== 'number' || !Number.isFinite(km)) return '—';
  return `${km.toFixed(2)} km`;
}

function ServerAssessmentDetail({
  assessment,
  building,
}: {
  assessment: Record<string, unknown>;
  building: Record<string, unknown> | null;
}) {
  const classLabel = (assessment.ai_fused_label as string) ?? 'Pending';
  const confidence = assessment.ai_fused_confidence as number | null;
  const { isUnsafe, isRestricted, isPending, badgeColor, gradientEnd } = badgeColors(classLabel);
  const actionRecs = assessment.action_recommendations as string[] | null;
  const serverStructural = (assessment.structural_data as Record<string, unknown> | null) ?? {};

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[badgeColor, gradientEnd]}
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
            {confidence != null ? `${formatPercent(confidence, 0)} confidence` : 'No AI result yet'}
          </Text>
        </View>
        {assessment.priority_score != null && (
          <View style={styles.priorityBadge}>
            <Text style={styles.priorityText}>
              Priority: {formatPercent(assessment.priority_score as number, 0)}
            </Text>
          </View>
        )}
      </LinearGradient>

      <SectionCard title="Building Information">
        <DataRow label="Code" value={(building?.building_code as string) ?? '—'} />
        <DataRow label="Address" value={(building?.address as string) ?? '—'} />
        <DataRow label="Barangay" value={(building?.barangay as string) ?? '—'} />
        <DataRow label="Use" value={(building?.building_use as string) ?? '—'} />
        <DataRow label="Stories" value={(building?.number_of_stories as string) ?? '—'} />
        <DataRow label="Year Built" value={(building?.year_built as string) ?? '—'} />
        {/* The sync endpoint never populates these building columns, so read what
            the inspector actually recorded, exactly as the portal does. */}
        <DataRow
          label="Soil Class"
          value={
            (building?.soil_classification as string) ??
            (typeof serverStructural.soilClass === 'string' ? serverStructural.soilClass : '—')
          }
        />
        <DataRow
          label="Distance to Fault"
          value={faultDistanceLabel(serverStructural, building?.distance_to_fault_km)}
        />
      </SectionCard>

      <SectionCard title="Assessment Details">
        <DataRow
          label="Phase"
          value={
            assessment.phase === 'pre-earthquake' ? 'Pre-Earthquake' : 'Post-Earthquake'
          }
        />
        <DataRow label="Status" value={(assessment.status as string) ?? '—'} />
        <DataRow
          label="Created"
          value={new Date(assessment.created_at as string).toLocaleDateString()}
        />
      </SectionCard>

      {(Boolean(assessment.ai_image_probabilities) || Boolean(assessment.ai_feature_importance)) && (
        <SectionCard title="AI Breakdown">
          {assessment.ai_image_probabilities != null &&
            typeof assessment.ai_image_probabilities === 'object' &&
            Object.entries(assessment.ai_image_probabilities as Record<string, number>).map(
              ([label, value]) => (
                <DataRow key={`img-${label}`} label={label.toUpperCase()} value={formatPercent(value)} />
              )
            )}
          {assessment.ai_feature_importance != null &&
            typeof assessment.ai_feature_importance === 'object' &&
            Object.entries(assessment.ai_feature_importance as Record<string, number>).map(
              ([label, value]) => (
                <DataRow
                  key={`tab-${label}`}
                  label={label.replace(/^cat__|^num__/, '').replace(/_/g, ' ')}
                  value={formatPercent(value)}
                />
              )
            )}
        </SectionCard>
      )}

      {actionRecs && actionRecs.length > 0 && (
        <SectionCard title="Action Plan">
          {actionRecs.map((rec, i) => (
            <View key={i} style={styles.actionRow}>
              <Text style={styles.actionBullet}>{i + 1}.</Text>
              <Text style={styles.actionText}>{rec}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {typeof assessment.action_plan_text === 'string' && !actionRecs?.length ? (
        <SectionCard title="Action Plan">
          <Text style={styles.actionText}>{assessment.action_plan_text}</Text>
        </SectionCard>
      ) : null}

      <SectionCard title="Engineer Review">
        {assessment.review_engineer_id != null ? (
          <View>
            <DataRow label="Status" value="Reviewed" />
            {typeof assessment.review_override_label === 'string' && (
              <DataRow label="Override" value={assessment.review_override_label} />
            )}
            {typeof assessment.review_justification === 'string' && (
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

export default function AssessmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [localItem, setLocalItem] = useState<OutboxItem | null | undefined>(undefined);
  const [assessment, setAssessment] = useState<Record<string, unknown> | null>(null);
  const [building, setBuilding] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      if (id && !isServerAssessmentId(id)) {
        const local = await getOutboxItem(id);
        if (local) {
          setLocalItem(local);
          setAssessment(null);
          setBuilding(null);
          setLoading(false);
          return;
        }
      }

      setLocalItem(null);
      const { data: aData } = await supabase.from('assessments').select('*').eq('id', id).single();

      if (aData?.building_id) {
        const { data: bData } = await supabase
          .from('buildings')
          .select('*')
          .eq('id', aData.building_id)
          .single();
        setBuilding(bData);
      } else {
        setBuilding(null);
      }

      setAssessment(aData);
      setLoading(false);
    }
    void load();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (localItem) {
    return <LocalAssessmentDetail item={localItem} />;
  }

  if (!assessment) {
    return (
      <View style={styles.center}>
        <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.errorText}>Assessment not found</Text>
      </View>
    );
  }

  return <ServerAssessmentDetail assessment={assessment} building={building} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing.xl, paddingTop: Spacing.sm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  errorText: { fontSize: FontSize.lg, color: Colors.textMuted, fontWeight: '600' },
  provenanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    backgroundColor: '#DBEAFE',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  provenanceText: { fontSize: FontSize.xs, fontWeight: '700', color: '#1E40AF', flex: 1 },
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
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dataLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  dataValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, maxWidth: '60%', textAlign: 'right' },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  actionBullet: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary, minWidth: 20 },
  actionText: { flex: 1, fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  pendingReview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: '#FFFBEB',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingText: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '500', flex: 1 },
  uploadHint: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500', flex: 1, lineHeight: 20 },
  gpsFixBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  gpsFixText: { flex: 1 },
  gpsFixTitle: { fontSize: FontSize.sm, fontWeight: '800', color: '#92400E' },
  gpsFixBody: { marginTop: 4, fontSize: FontSize.xs, color: '#78350F', lineHeight: 18 },
  gpsFixErr: { marginTop: 6, fontSize: FontSize.xs, color: Colors.error },
  gpsFixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.md,
  },
  gpsFixBtnText: { color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '800' },
  gpsRefreshLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xs,
  },
  gpsRefreshLinkText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
});
