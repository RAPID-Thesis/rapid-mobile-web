import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { ImageAngle, AssessmentPhase, BuildingUse } from '../../types';
import Step3StructuralData, { StructuralDataState } from './Step3StructuralData';
import { WizardTheme } from './wizardTheme';

const STEPS = ['Building Info', 'Photo Capture', 'Structural Data', 'Review'];
const CONTROL_HEIGHT = Math.max(MinTouchTarget, 48);

const ANGLES: { key: ImageAngle; label: string; icon: string }[] = [
  { key: 'front', label: 'Front Facade', icon: 'image' },
  { key: 'left', label: 'Left Side', icon: 'arrow-back' },
  { key: 'right', label: 'Right Side', icon: 'arrow-forward' },
  { key: 'closeup', label: 'Damage Close-up', icon: 'search' },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={styles.stepRow}>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.stepItemWrap}>
          <View style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                i === current && styles.stepCircleActive,
                i < current && styles.stepCircleComplete,
              ]}
            >
              {i < current ? (
                <Ionicons name="checkmark" size={14} color="#FFF" />
              ) : (
                <Text
                  style={[
                    styles.stepNum,
                    i === current && styles.stepNumActive,
                    i < current && styles.stepNumComplete,
                  ]}
                >
                  {i + 1}
                </Text>
              )}
            </View>
            <Text
              style={[
                styles.stepLabel,
                i === current && styles.stepLabelActive,
                i < current && styles.stepLabelComplete,
              ]}
            >
              {label}
            </Text>
          </View>
          {i < STEPS.length - 1 ? (
            <View style={[styles.stepConnector, i < current && styles.stepConnectorDone]} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export default function NewAssessmentScreen() {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<AssessmentPhase>('pre-earthquake');
  const [buildingCode, setBuildingCode] = useState('');
  const [address, setAddress] = useState('');
  const [barangay, setBarangay] = useState('');
  const [buildingUse, setBuildingUse] = useState<BuildingUse>('residential');
  const [capturedAngles, setCapturedAngles] = useState<ImageAngle[]>([]);
  const [structuralData, setStructuralData] = useState<StructuralDataState>({
    stories: '',
    yearBuilt: '',
    structuralSystem: '',
    primaryMaterial: '',
    condition: '',
    soilClass: '',
    topography: '',
    verticalIrregularity: false,
    planIrregularity: false,
    poundingHazard: false,
    fallingHazard: false,
  });

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [step]);

  const mockCapture = (angle: ImageAngle) => {
    if (!capturedAngles.includes(angle)) {
      setCapturedAngles([...capturedAngles, angle]);
    }
  };

  const handleSubmit = () => {
    Alert.alert('Assessment Saved', 'Your assessment has been saved locally and queued for sync.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const canProceed = () => {
    if (step === 0) return buildingCode.length > 0 && address.length > 0;
    if (step === 1) return capturedAngles.length >= 2;
    if (step === 2) {
      return Boolean(
        structuralData.primaryMaterial &&
        structuralData.structuralSystem &&
        structuralData.soilClass &&
        structuralData.topography
      );
    }
    return true;
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerShell}>
        <StepIndicator current={step} />
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>Step {step + 1} of {STEPS.length}</Text>
          <Text style={styles.progressText}>
            {Math.round(((step + 1) / STEPS.length) * 100)}% complete
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={18} color={WizardTheme.colors.primary} />
          <Text style={styles.infoBannerText}>
            FEMA P-154 and ATC-20 aligned workflow. Minimum 2 photo angles required.
          </Text>
        </View>

        {step === 0 && (
          <View style={styles.stepCard}>
            <Text style={styles.sectionTitle}>Assessment Phase</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, phase === 'pre-earthquake' && styles.toggleBtnActive]}
                onPress={() => setPhase('pre-earthquake')}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={18}
                  color={phase === 'pre-earthquake' ? '#FFF' : WizardTheme.colors.text}
                />
                <Text style={[styles.toggleText, phase === 'pre-earthquake' && styles.toggleTextActive]}>
                  Pre-Earthquake
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, phase === 'post-earthquake' && styles.toggleBtnActive]}
                onPress={() => setPhase('post-earthquake')}
              >
                <Ionicons
                  name="warning"
                  size={18}
                  color={phase === 'post-earthquake' ? '#FFF' : WizardTheme.colors.text}
                />
                <Text style={[styles.toggleText, phase === 'post-earthquake' && styles.toggleTextActive]}>
                  Post-Earthquake
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Building Information</Text>
            <Text style={styles.fieldLabel}>Building Code *</Text>
            <TextInput
              style={styles.input}
              value={buildingCode}
              onChangeText={setBuildingCode}
              placeholder="e.g. TAAL-011"
              placeholderTextColor={WizardTheme.colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Address *</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Street address"
              placeholderTextColor={WizardTheme.colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Barangay</Text>
            <TextInput
              style={styles.input}
              value={barangay}
              onChangeText={setBarangay}
              placeholder="Barangay name"
              placeholderTextColor={WizardTheme.colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Building Use</Text>
            <View style={styles.chipRow}>
              {(['residential', 'commercial', 'institutional', 'industrial', 'mixed'] as BuildingUse[]).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.chip, buildingUse === u && styles.chipActive]}
                  onPress={() => setBuildingUse(u)}
                >
                  <Text style={[styles.chipText, buildingUse === u && styles.chipTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepCard}>
            <Text style={styles.sectionTitle}>Smart Framing Guide</Text>
            <Text style={styles.hint}>
              Capture at least 2 of 4 angles. Tap each angle to simulate capture.
            </Text>

            <View style={styles.cameraPreview}>
              <View style={styles.gridOverlay}>
                <View style={styles.gridLineH} />
                <View style={styles.gridLineH2} />
                <View style={styles.gridLineV} />
                <View style={styles.gridLineV2} />
              </View>
              <View style={styles.centerCross}>
                <Ionicons name="add" size={40} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={styles.cameraLabel}>Camera Preview (Simulated)</Text>
            </View>

            <Text style={styles.fieldLabel}>Required Angles ({capturedAngles.length}/4 captured)</Text>
            {ANGLES.map((a) => {
              const captured = capturedAngles.includes(a.key);
              return (
                <TouchableOpacity
                  key={a.key}
                  style={[styles.angleRow, captured && styles.angleRowCaptured]}
                  onPress={() => mockCapture(a.key)}
                >
                  <Ionicons
                    name={captured ? 'checkmark-circle' : (a.icon as any)}
                    size={24}
                    color={captured ? WizardTheme.colors.success : WizardTheme.colors.textMuted}
                  />
                  <Text style={[styles.angleLabel, captured && styles.angleLabelCaptured]}>{a.label}</Text>
                  {!captured && <Text style={styles.angleTap}>TAP TO CAPTURE</Text>}
                  {captured && <Text style={[styles.angleTap, styles.angleTapCaptured]}>CAPTURED</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {step === 2 && (
          <Step3StructuralData
            value={structuralData}
            onChange={setStructuralData}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            canProceed={canProceed()}
          />
        )}

        {step === 3 && (
          <View style={styles.stepCard}>
            <Text style={styles.sectionTitle}>Review Assessment</Text>

            <View style={styles.offlineNotice}>
              <Ionicons name="cloud-offline" size={20} color={WizardTheme.colors.infoText} />
              <Text style={styles.offlineText}>
                📡 Offline Mode Active: Assessment will be saved locally and synced automatically when
                connection is restored.
              </Text>
            </View>

            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Phase</Text>
              <Text style={styles.reviewValue}>
                {phase === 'pre-earthquake' ? 'Pre-Earthquake' : 'Post-Earthquake'}
              </Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Building</Text>
              <Text style={styles.reviewValue}>
                {buildingCode} — {address}
              </Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Photos</Text>
              <Text style={styles.reviewValue}>
                {capturedAngles.length} captured ({capturedAngles.join(', ')})
              </Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Material</Text>
              <Text style={styles.reviewValue}>{structuralData.primaryMaterial || 'Not specified'}</Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Structural System</Text>
              <Text style={styles.reviewValue}>{structuralData.structuralSystem || 'Not specified'}</Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Soil & Topography</Text>
              <Text style={styles.reviewValue}>
                {(structuralData.soilClass || 'Not specified')} /{' '}
                {(structuralData.topography || 'Not specified')}
              </Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Vulnerability Modifiers</Text>
              <Text style={styles.reviewValue}>
                {[
                  structuralData.verticalIrregularity ? 'Vertical irregularity' : null,
                  structuralData.planIrregularity ? 'Plan irregularity' : null,
                  structuralData.poundingHazard ? 'Pounding hazard' : null,
                  structuralData.fallingHazard ? 'Falling hazard' : null,
                ]
                  .filter(Boolean)
                  .join(', ') || 'None observed'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === 2 ? null : (
          <>
            {step > 0 && (
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
              onPress={() => (step < 3 ? setStep(step + 1) : handleSubmit())}
              disabled={!canProceed()}
            >
              <Text style={styles.nextBtnText}>{step < 3 ? 'Next' : 'Save Assessment'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WizardTheme.colors.background },
  headerShell: {
    backgroundColor: WizardTheme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: WizardTheme.colors.border,
    paddingTop: WizardTheme.spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    paddingHorizontal: WizardTheme.spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepItemWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepConnector: {
    flex: 1,
    height: 2,
    borderRadius: WizardTheme.radius.pill,
    backgroundColor: WizardTheme.colors.pending,
    marginHorizontal: 6,
    marginTop: 14,
    opacity: 0.35,
  },
  stepConnectorDone: {
    backgroundColor: WizardTheme.colors.success,
    opacity: 1,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: WizardTheme.spacing.md,
    paddingVertical: WizardTheme.spacing.md,
  },
  progressText: {
    fontSize: WizardTheme.typography.helper,
    color: WizardTheme.colors.textMuted,
    fontWeight: '700',
  },
  stepItem: { alignItems: 'center', minWidth: 66 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: { backgroundColor: WizardTheme.colors.primary },
  stepCircleComplete: { backgroundColor: WizardTheme.colors.success },
  stepNum: { fontSize: 12, fontWeight: '700', color: WizardTheme.colors.pending },
  stepNumActive: { color: '#FFFFFF' },
  stepNumComplete: { color: '#FFFFFF' },
  stepLabel: {
    fontSize: 12,
    color: WizardTheme.colors.pending,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  stepLabelActive: { color: WizardTheme.colors.primary, fontWeight: '800' },
  stepLabelComplete: { color: WizardTheme.colors.success, fontWeight: '700' },
  scrollContent: { flex: 1 },
  scrollInner: { padding: WizardTheme.spacing.md, paddingBottom: 100, gap: WizardTheme.spacing.lg },
  stepCard: {
    backgroundColor: WizardTheme.colors.card,
    borderRadius: WizardTheme.radius.md,
    padding: WizardTheme.spacing.md,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    ...WizardTheme.elevation,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: WizardTheme.colors.text,
    marginBottom: WizardTheme.spacing.md,
    marginTop: WizardTheme.spacing.sm,
  },
  hint: {
    fontSize: WizardTheme.typography.helper,
    color: WizardTheme.colors.textMuted,
    marginBottom: WizardTheme.spacing.md,
  },
  infoBanner: {
    backgroundColor: WizardTheme.colors.infoBg,
    borderWidth: 1,
    borderColor: WizardTheme.colors.infoBorder,
    borderRadius: WizardTheme.radius.md,
    padding: WizardTheme.spacing.md,
    flexDirection: 'row',
    gap: WizardTheme.spacing.sm,
    alignItems: 'center',
  },
  infoBannerText: {
    flex: 1,
    color: WizardTheme.colors.infoText,
    fontSize: WizardTheme.typography.helper,
    fontWeight: '600',
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: WizardTheme.typography.label,
    fontWeight: '700',
    color: WizardTheme.colors.text,
    marginTop: WizardTheme.spacing.md,
    marginBottom: WizardTheme.spacing.sm,
  },
  input: {
    minHeight: CONTROL_HEIGHT,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    borderRadius: WizardTheme.radius.md,
    paddingHorizontal: WizardTheme.spacing.md,
    fontSize: WizardTheme.typography.body,
    color: WizardTheme.colors.text,
    backgroundColor: WizardTheme.colors.card,
  },
  toggleRow: { flexDirection: 'row', gap: WizardTheme.spacing.md },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: WizardTheme.spacing.sm,
    minHeight: CONTROL_HEIGHT,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    borderRadius: WizardTheme.radius.md,
    backgroundColor: WizardTheme.colors.card,
  },
  toggleBtnActive: { backgroundColor: WizardTheme.colors.primary, borderColor: WizardTheme.colors.primary },
  toggleText: { fontSize: WizardTheme.typography.body, fontWeight: '700', color: WizardTheme.colors.text },
  toggleTextActive: { color: '#FFF' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: WizardTheme.spacing.sm },
  chip: {
    minHeight: CONTROL_HEIGHT,
    paddingHorizontal: WizardTheme.spacing.md,
    borderRadius: WizardTheme.radius.pill,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    backgroundColor: WizardTheme.colors.card,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: WizardTheme.colors.primary, borderColor: WizardTheme.colors.primary },
  chipText: { fontSize: WizardTheme.typography.body, color: WizardTheme.colors.text },
  chipTextActive: { color: '#FFF' },
  cameraPreview: {
    height: 220,
    backgroundColor: '#0F172A',
    borderRadius: WizardTheme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: WizardTheme.spacing.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  gridOverlay: { ...StyleSheet.absoluteFillObject },
  gridLineH: { position: 'absolute', top: '33%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  gridLineH2: { position: 'absolute', top: '66%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  gridLineV: { position: 'absolute', left: '33%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  gridLineV2: { position: 'absolute', left: '66%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  centerCross: { zIndex: 1 },
  cameraLabel: {
    position: 'absolute',
    bottom: 12,
    color: 'rgba(255,255,255,0.68)',
    fontSize: WizardTheme.typography.helper,
  },
  angleRow: {
    minHeight: CONTROL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: WizardTheme.spacing.md,
    paddingHorizontal: WizardTheme.spacing.md,
    backgroundColor: WizardTheme.colors.card,
    borderRadius: WizardTheme.radius.md,
    marginBottom: WizardTheme.spacing.sm,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
  },
  angleRowCaptured: { backgroundColor: '#EDF7EE', borderColor: '#9AD4A1' },
  angleLabel: { flex: 1, fontSize: WizardTheme.typography.body, color: WizardTheme.colors.text, fontWeight: '600' },
  angleLabelCaptured: { color: WizardTheme.colors.success, fontWeight: '700' },
  angleTap: { fontSize: 12, fontWeight: '800', color: WizardTheme.colors.primary },
  angleTapCaptured: { color: WizardTheme.colors.success },
  reviewSection: {
    backgroundColor: WizardTheme.colors.card,
    borderRadius: WizardTheme.radius.md,
    padding: WizardTheme.spacing.md,
    marginBottom: WizardTheme.spacing.md,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
  },
  reviewLabel: {
    fontSize: 12,
    color: WizardTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  reviewValue: {
    fontSize: WizardTheme.typography.body,
    color: WizardTheme.colors.text,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 22,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: WizardTheme.spacing.sm,
    backgroundColor: WizardTheme.colors.infoBg,
    borderWidth: 1,
    borderColor: WizardTheme.colors.infoBorder,
    padding: WizardTheme.spacing.md,
    borderRadius: WizardTheme.radius.md,
    marginBottom: WizardTheme.spacing.lg,
  },
  offlineText: {
    flex: 1,
    fontSize: WizardTheme.typography.helper,
    color: WizardTheme.colors.infoText,
    lineHeight: 18,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: WizardTheme.spacing.md,
    padding: WizardTheme.spacing.md,
    backgroundColor: WizardTheme.colors.card,
    borderTopWidth: 1,
    borderTopColor: WizardTheme.colors.border,
  },
  backBtn: {
    flex: 1,
    minHeight: CONTROL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    borderRadius: WizardTheme.radius.md,
    backgroundColor: WizardTheme.colors.card,
  },
  backBtnText: { fontSize: WizardTheme.typography.body, fontWeight: '700', color: WizardTheme.colors.text },
  nextBtn: {
    flex: 2,
    minHeight: CONTROL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WizardTheme.colors.primary,
    borderRadius: WizardTheme.radius.md,
  },
  nextBtnDisabled: { backgroundColor: WizardTheme.colors.pending },
  nextBtnText: { color: '#FFF', fontSize: WizardTheme.typography.body, fontWeight: '800' },
});
