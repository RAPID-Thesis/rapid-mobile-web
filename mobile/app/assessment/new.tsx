import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { ImageAngle, AssessmentPhase, BuildingUse } from '../../types';
import Step3StructuralData, { StructuralDataState } from './Step3StructuralData';
import { WizardTheme } from '../../constants/wizardTheme';
import CameraCapture, { CapturedPhoto } from './CameraCapture';
import Text from '../../components/CustomText';
import { useAuth } from '../../context/AuthContext';
import NetInfo from '@react-native-community/netinfo';
import { isApiUrlConfigured } from '../../services/api';
import { predictOfflineHeuristic } from '../../services/localPredict';
import { enqueueOutbox, processOutbox } from '../../services/outbox';
import { submitAssessmentForMlSync, type WizardAssessmentSyncInput } from '../../services/sync';

const STEPS = ['Building Info', 'Photo Capture', 'Structural Data', 'Review'];
const CONTROL_HEIGHT = Math.max(MinTouchTarget, 48);

const ANGLES: { key: ImageAngle; label: string; icon: string }[] = [
  { key: 'front', label: 'Front Facade', icon: 'image' },
  { key: 'left', label: 'Left Side', icon: 'arrow-back' },
  { key: 'right', label: 'Right Side', icon: 'arrow-forward' },
  { key: 'closeup', label: 'Damage Close-up', icon: 'search' },
];

async function canUploadToApiNow(): Promise<boolean> {
  if (!isApiUrlConfigured()) return false;
  const s = await NetInfo.fetch();
  if (!s.isConnected) return false;
  if (s.isInternetReachable === false) return false;
  return true;
}

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
  const { session, profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<AssessmentPhase>('pre-earthquake');
  const [buildingCode, setBuildingCode] = useState('');
  const [address, setAddress] = useState('');
  const [barangay, setBarangay] = useState('');
  const [buildingUse, setBuildingUse] = useState<BuildingUse>('residential');
  const [capturedPhotos, setCapturedPhotos] = useState<Partial<Record<ImageAngle, CapturedPhoto>>>({});
  const [captureTarget, setCaptureTarget] = useState<ImageAngle | null>(null);
  const capturedAngles = Object.keys(capturedPhotos) as ImageAngle[];
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

  const offlineEstimate = useMemo(() => {
    if (step !== 3) return null;
    const storiesParsed = parseInt(structuralData.stories, 10);
    const yearParsed = structuralData.yearBuilt.trim()
      ? parseInt(structuralData.yearBuilt, 10)
      : NaN;
    const stories = Number.isFinite(storiesParsed) && storiesParsed > 0 ? storiesParsed : 1;
    const yearBuilt = Number.isFinite(yearParsed) ? yearParsed : null;
    return predictOfflineHeuristic({
      phase,
      buildingUse,
      yearBuilt,
      numberOfStories: stories,
      structuralData: {
        primaryMaterial: structuralData.primaryMaterial,
        structuralSystem: structuralData.structuralSystem,
        soilClass: structuralData.soilClass,
        topography: structuralData.topography,
        condition: structuralData.condition,
        verticalIrregularity: structuralData.verticalIrregularity,
        planIrregularity: structuralData.planIrregularity,
        poundingHazard: structuralData.poundingHazard,
        fallingHazard: structuralData.fallingHazard,
      },
      imageCount: capturedAngles.length,
    });
  }, [step, phase, buildingUse, structuralData, capturedAngles.length]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [step]);

  const openCapture = (angle: ImageAngle) => setCaptureTarget(angle);

  const handleCaptured = (photo: CapturedPhoto) => {
    setCapturedPhotos((prev) => ({ ...prev, [photo.angle]: photo }));
    setCaptureTarget(null);
  };

  const removeCapture = (angle: ImageAngle) => {
    setCapturedPhotos((prev) => {
      const next = { ...prev };
      delete next[angle];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!session?.user) {
      Alert.alert('Sign in required', 'Please sign in to save assessments to the server.');
      return;
    }

    setSaving(true);
    try {
      const code = buildingCode.trim();
      const municipality = (profile?.lgu_code ?? '').trim() || 'Unknown';
      const barangayVal = barangay.trim() || 'TBD';
      const storiesParsed = parseInt(structuralData.stories, 10);
      const yearParsed = structuralData.yearBuilt.trim()
        ? parseInt(structuralData.yearBuilt, 10)
        : NaN;

      const stories =
        Number.isFinite(storiesParsed) && storiesParsed > 0 ? storiesParsed : 1;
      const yearBuilt = Number.isFinite(yearParsed) ? yearParsed : null;

      const structural_data = {
        stories: structuralData.stories,
        yearBuilt: structuralData.yearBuilt,
        structuralSystem: structuralData.structuralSystem,
        primaryMaterial: structuralData.primaryMaterial,
        condition: structuralData.condition,
        soilClass: structuralData.soilClass,
        topography: structuralData.topography,
        verticalIrregularity: structuralData.verticalIrregularity,
        planIrregularity: structuralData.planIrregularity,
        poundingHazard: structuralData.poundingHazard,
        fallingHazard: structuralData.fallingHazard,
        capturedAngles,
      };

      const imageUris = ANGLES.map((a) => capturedPhotos[a.key]?.uri).filter(
        (u): u is string => Boolean(u)
      );

      const localPrediction = predictOfflineHeuristic({
        phase,
        buildingUse,
        yearBuilt,
        numberOfStories: stories,
        structuralData: {
          primaryMaterial: structuralData.primaryMaterial,
          structuralSystem: structuralData.structuralSystem,
          soilClass: structuralData.soilClass,
          topography: structuralData.topography,
          condition: structuralData.condition,
          verticalIrregularity: structuralData.verticalIrregularity,
          planIrregularity: structuralData.planIrregularity,
          poundingHazard: structuralData.poundingHazard,
          fallingHazard: structuralData.fallingHazard,
        },
        imageCount: imageUris.length,
      });

      const input: WizardAssessmentSyncInput = {
        building_code: code,
        address: address.trim(),
        barangay: barangayVal,
        municipality,
        building_use: buildingUse,
        number_of_stories: stories,
        year_built: yearBuilt,
        phase,
        structural_data,
        imageUris,
      };

      if (await canUploadToApiNow()) {
        try {
          await submitAssessmentForMlSync(input);
          await processOutbox();
          Alert.alert(
            'Assessment saved',
            'The server is analyzing this record. It will appear on the web dashboard shortly.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        } catch {
          // Queue for retry when the API is down or unreachable.
        }
      }

      await enqueueOutbox({ input, localPrediction });
      void processOutbox();
      Alert.alert(
        'Saved on this device',
        `Offline risk estimate: ${localPrediction.fusedLabel} (${Math.round(localPrediction.fusedConfidence * 100)}% confidence). It will upload to the web app when you are back online.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not save assessment.';
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
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
              Capture at least 2 of 4 angles. Each photo is checked for blur, tilt, and minimum
              resolution before you continue.
            </Text>

            <Text style={styles.fieldLabel}>Required Angles ({capturedAngles.length}/4 captured)</Text>
            {ANGLES.map((a) => {
              const photo = capturedPhotos[a.key];
              const captured = Boolean(photo);
              return (
                <View
                  key={a.key}
                  style={[styles.angleRow, captured && styles.angleRowCaptured]}
                >
                  {captured && photo ? (
                    <Image source={{ uri: photo.uri }} style={styles.angleThumb} />
                  ) : (
                    <View style={styles.angleThumbPlaceholder}>
                      <Ionicons name={a.icon as any} size={22} color={WizardTheme.colors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.angleLabel, captured && styles.angleLabelCaptured]}>
                      {a.label}
                    </Text>
                    {captured && photo ? (
                      <Text style={styles.angleMeta}>
                        {photo.width}×{photo.height} • tilt {photo.tiltDeg.toFixed(0)}°
                      </Text>
                    ) : null}
                  </View>
                  {captured ? (
                    <View style={styles.angleActions}>
                      <TouchableOpacity
                        style={styles.angleActionBtn}
                        onPress={() => openCapture(a.key)}
                        accessibilityLabel={`Retake ${a.label}`}
                      >
                        <Ionicons name="refresh" size={18} color={WizardTheme.colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.angleActionBtn}
                        onPress={() => removeCapture(a.key)}
                        accessibilityLabel={`Remove ${a.label}`}
                      >
                        <Ionicons name="trash-outline" size={18} color={WizardTheme.colors.unsafe} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.captureBtn} onPress={() => openCapture(a.key)}>
                      <Ionicons name="camera" size={16} color="#FFF" />
                      <Text style={styles.captureBtnText}>Capture</Text>
                    </TouchableOpacity>
                  )}
                </View>
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
              <Ionicons name="analytics-outline" size={20} color={WizardTheme.colors.infoText} />
              <Text style={styles.offlineText}>
                Save sends this record to the server when the API is reachable. You always get an
                on-device risk estimate below; full ResNet + tabular fusion runs after upload.
              </Text>
            </View>

            {offlineEstimate ? (
              <View style={styles.estimateCard}>
                <Text style={styles.estimateEyebrow}>On-device estimate (offline-capable)</Text>
                <Text style={styles.estimateLabel}>{offlineEstimate.fusedLabel}</Text>
                <Text style={styles.estimateMeta}>
                  {Math.round(offlineEstimate.fusedConfidence * 100)}% confidence
                </Text>
              </View>
            ) : null}

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
                {capturedAngles.length} captured{capturedAngles.length > 0 ? ` (${capturedAngles.join(', ')})` : ''}
              </Text>
              {capturedAngles.length > 0 ? (
                <View style={styles.reviewThumbs}>
                  {capturedAngles.map((a) => {
                    const p = capturedPhotos[a];
                    return p ? (
                      <Image key={a} source={{ uri: p.uri }} style={styles.reviewThumb} />
                    ) : null;
                  })}
                </View>
              ) : null}
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
              style={[styles.nextBtn, (!canProceed() || saving) && styles.nextBtnDisabled]}
              onPress={() => (step < 3 ? setStep(step + 1) : void handleSubmit())}
              disabled={!canProceed() || saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.nextBtnText}>{step < 3 ? 'Next' : 'Save Assessment'}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <CameraCapture
        visible={captureTarget !== null}
        angle={captureTarget ?? 'front'}
        onCancel={() => setCaptureTarget(null)}
        onCaptured={handleCaptured}
      />
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
  angleRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: WizardTheme.spacing.md,
    padding: WizardTheme.spacing.sm,
    backgroundColor: WizardTheme.colors.card,
    borderRadius: WizardTheme.radius.md,
    marginBottom: WizardTheme.spacing.sm,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
  },
  angleRowCaptured: { backgroundColor: '#EDF7EE', borderColor: '#9AD4A1' },
  angleLabel: { fontSize: WizardTheme.typography.body, color: WizardTheme.colors.text, fontWeight: '600' },
  angleLabelCaptured: { color: WizardTheme.colors.success, fontWeight: '700' },
  angleMeta: { fontSize: 12, color: WizardTheme.colors.textMuted, marginTop: 2 },
  angleThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#0F172A' },
  angleThumbPlaceholder: {
    width: 52, height: 52, borderRadius: 8,
    backgroundColor: WizardTheme.colors.background,
    borderWidth: 1, borderColor: WizardTheme.colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  angleActions: { flexDirection: 'row', gap: 6 },
  angleActionBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: WizardTheme.colors.background,
    borderWidth: 1, borderColor: WizardTheme.colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: WizardTheme.colors.primary,
    borderRadius: WizardTheme.radius.md,
  },
  captureBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  reviewThumbs: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10,
  },
  reviewThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#0F172A' },
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
  estimateCard: {
    backgroundColor: WizardTheme.colors.card,
    borderRadius: WizardTheme.radius.md,
    padding: WizardTheme.spacing.md,
    marginBottom: WizardTheme.spacing.md,
    borderWidth: 1,
    borderColor: WizardTheme.colors.primary,
  },
  estimateEyebrow: {
    fontSize: 11,
    color: WizardTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: '700',
  },
  estimateLabel: {
    fontSize: 26,
    fontWeight: '800',
    color: WizardTheme.colors.primary,
    marginTop: 6,
  },
  estimateMeta: {
    fontSize: WizardTheme.typography.helper,
    color: WizardTheme.colors.textMuted,
    marginTop: 4,
    fontWeight: '600',
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
