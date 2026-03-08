import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { ImageAngle, AssessmentPhase, BuildingUse, SoilClass } from '../../types';

const STEPS = ['Building Info', 'Photo Capture', 'Structural Data', 'Review'];

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
        <View key={label} style={styles.stepItem}>
          <View style={[styles.stepCircle, i <= current && styles.stepCircleActive]}>
            {i < current ? (
              <Ionicons name="checkmark" size={14} color="#FFF" />
            ) : (
              <Text style={[styles.stepNum, i <= current && styles.stepNumActive]}>{i + 1}</Text>
            )}
          </View>
          <Text style={[styles.stepLabel, i <= current && styles.stepLabelActive]}>{label}</Text>
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
  const [stories, setStories] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [structuralSystem, setStructuralSystem] = useState('');
  const [soilClass, setSoilClass] = useState<SoilClass>('C');
  const [material, setMaterial] = useState('');
  const [condition, setCondition] = useState('');
  const [capturedAngles, setCapturedAngles] = useState<ImageAngle[]>([]);

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
    if (step === 2) return material.length > 0;
    return true;
  };

  return (
    <View style={styles.container}>
      <StepIndicator current={step} />

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        {step === 0 && (
          <View>
            <Text style={styles.sectionTitle}>Assessment Phase</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, phase === 'pre-earthquake' && styles.toggleBtnActive]}
                onPress={() => setPhase('pre-earthquake')}
              >
                <Ionicons name="shield-checkmark" size={18} color={phase === 'pre-earthquake' ? '#FFF' : Colors.text} />
                <Text style={[styles.toggleText, phase === 'pre-earthquake' && styles.toggleTextActive]}>Pre-Earthquake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, phase === 'post-earthquake' && styles.toggleBtnActive]}
                onPress={() => setPhase('post-earthquake')}
              >
                <Ionicons name="warning" size={18} color={phase === 'post-earthquake' ? '#FFF' : Colors.text} />
                <Text style={[styles.toggleText, phase === 'post-earthquake' && styles.toggleTextActive]}>Post-Earthquake</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Building Information</Text>
            <Text style={styles.fieldLabel}>Building Code *</Text>
            <TextInput style={styles.input} value={buildingCode} onChangeText={setBuildingCode} placeholder="e.g. TAAL-011" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.fieldLabel}>Address *</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Street address" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.fieldLabel}>Barangay</Text>
            <TextInput style={styles.input} value={barangay} onChangeText={setBarangay} placeholder="Barangay name" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.fieldLabel}>Building Use</Text>
            <View style={styles.chipRow}>
              {(['residential', 'commercial', 'institutional', 'industrial', 'mixed'] as BuildingUse[]).map((u) => (
                <TouchableOpacity key={u} style={[styles.chip, buildingUse === u && styles.chipActive]} onPress={() => setBuildingUse(u)}>
                  <Text style={[styles.chipText, buildingUse === u && styles.chipTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.sectionTitle}>Smart Framing Guide</Text>
            <Text style={styles.hint}>Capture at least 2 of 4 angles. Tap each angle to simulate capture.</Text>

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
                <TouchableOpacity key={a.key} style={[styles.angleRow, captured && styles.angleRowCaptured]} onPress={() => mockCapture(a.key)}>
                  <Ionicons name={captured ? 'checkmark-circle' : (a.icon as any)} size={24} color={captured ? Colors.success : Colors.textSecondary} />
                  <Text style={[styles.angleLabel, captured && styles.angleLabelCaptured]}>{a.label}</Text>
                  {!captured && <Text style={styles.angleTap}>TAP TO CAPTURE</Text>}
                  {captured && <Text style={[styles.angleTap, { color: Colors.success }]}>CAPTURED</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.sectionTitle}>Structural Data Checklist</Text>

            <Text style={styles.fieldLabel}>Number of Stories</Text>
            <TextInput style={styles.input} value={stories} onChangeText={setStories} placeholder="e.g. 2" keyboardType="numeric" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.fieldLabel}>Year Built</Text>
            <TextInput style={styles.input} value={yearBuilt} onChangeText={setYearBuilt} placeholder="e.g. 1990" keyboardType="numeric" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.fieldLabel}>Structural System</Text>
            <TextInput style={styles.input} value={structuralSystem} onChangeText={setStructuralSystem} placeholder="e.g. Reinforced Concrete Frame" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.fieldLabel}>Primary Material *</Text>
            <TextInput style={styles.input} value={material} onChangeText={setMaterial} placeholder="e.g. Reinforced Concrete" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.fieldLabel}>Condition</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={condition} onChangeText={setCondition} placeholder="Describe visible condition..." multiline placeholderTextColor={Colors.textMuted} />

            <Text style={styles.fieldLabel}>Soil Classification</Text>
            <View style={styles.chipRow}>
              {(['A', 'B', 'C', 'D', 'E', 'F'] as SoilClass[]).map((s) => (
                <TouchableOpacity key={s} style={[styles.chip, soilClass === s && styles.chipActive]} onPress={() => setSoilClass(s)}>
                  <Text style={[styles.chipText, soilClass === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.sectionTitle}>Review Assessment</Text>

            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Phase</Text>
              <Text style={styles.reviewValue}>{phase === 'pre-earthquake' ? 'Pre-Earthquake' : 'Post-Earthquake'}</Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Building</Text>
              <Text style={styles.reviewValue}>{buildingCode} — {address}</Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Photos</Text>
              <Text style={styles.reviewValue}>{capturedAngles.length} captured ({capturedAngles.join(', ')})</Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Material</Text>
              <Text style={styles.reviewValue}>{material || 'Not specified'}</Text>
            </View>
            <View style={styles.reviewSection}>
              <Text style={styles.reviewLabel}>Soil Class</Text>
              <Text style={styles.reviewValue}>{soilClass}</Text>
            </View>

            <View style={styles.offlineNotice}>
              <Ionicons name="cloud-offline" size={20} color={Colors.statusPendingSync} />
              <Text style={styles.offlineText}>
                This assessment will be saved locally and synced when connectivity is available.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stepItem: { alignItems: 'center', flex: 1 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  stepCircleActive: { backgroundColor: Colors.primary },
  stepNum: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted },
  stepNumActive: { color: '#FFF' },
  stepLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },
  stepLabelActive: { color: Colors.primary, fontWeight: '600' },
  scrollContent: { flex: 1 },
  scrollInner: { padding: Spacing.md, paddingBottom: 100 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  hint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginTop: Spacing.md, marginBottom: Spacing.xs },
  input: { height: MinTouchTarget, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
  toggleRow: { flexDirection: 'row', gap: Spacing.sm },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, height: MinTouchTarget, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, backgroundColor: Colors.surface },
  toggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  toggleTextActive: { color: '#FFF' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, color: Colors.text },
  chipTextActive: { color: '#FFF' },
  cameraPreview: { height: 220, backgroundColor: '#1a1a2e', borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: Spacing.md },
  gridOverlay: { ...StyleSheet.absoluteFillObject },
  gridLineH: { position: 'absolute', top: '33%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  gridLineH2: { position: 'absolute', top: '66%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  gridLineV: { position: 'absolute', left: '33%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  gridLineV2: { position: 'absolute', left: '66%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  centerCross: { zIndex: 1 },
  cameraLabel: { position: 'absolute', bottom: 12, color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs },
  angleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.sm, marginBottom: Spacing.xs },
  angleRowCaptured: { backgroundColor: '#F0FFF4' },
  angleLabel: { flex: 1, fontSize: FontSize.md, color: Colors.text },
  angleLabelCaptured: { color: Colors.success, fontWeight: '600' },
  angleTap: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  reviewSection: { backgroundColor: Colors.surface, borderRadius: BorderRadius.sm, padding: Spacing.md, marginBottom: Spacing.xs },
  reviewLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  reviewValue: { fontSize: FontSize.md, color: Colors.text, fontWeight: '500', marginTop: 2 },
  offlineNotice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#EEF2FF', padding: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.md },
  offlineText: { flex: 1, fontSize: FontSize.sm, color: Colors.statusPendingSync },
  footer: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  backBtn: { flex: 1, height: MinTouchTarget, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm },
  backBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  nextBtn: { flex: 2, height: MinTouchTarget, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.sm },
  nextBtnDisabled: { backgroundColor: Colors.textMuted },
  nextBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});
