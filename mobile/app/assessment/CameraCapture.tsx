import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { WizardTheme } from '../../constants/wizardTheme';
import { APP_NAME } from '../../constants/branding';
import Text from '../../components/CustomText';

export interface CapturedPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  blurScore: number;
  capturedAt: string;
}

interface CameraCaptureProps {
  visible: boolean;
  onCancel: () => void;
  onCaptured: (photo: CapturedPhoto) => void;
}

const CAPTURE_GUIDANCE = {
  title: 'Capture Damage',
  hint: 'Frame the damage clearly. Keep the subject centered and use good lighting.',
};

// --- Quality thresholds ---
const MIN_DIMENSION = 800;
const BLUR_WARN_THRESHOLD = 0.020;  // JPEG detail-density proxy; lower = blurrier

export default function CameraCapture({ visible, onCancel, onCaptured }: CameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Omit<CapturedPhoto, 'id'> | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (!permission) return;
    if (!permission.granted) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleCapture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.92, exif: false });
      if (!pic?.uri) throw new Error('Capture returned no URI.');
      const photo = await analyzeQuality(pic);
      setPreview(photo);
    } catch (err: any) {
      Alert.alert('Capture failed', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = () => {
    if (!preview) return;
    onCaptured({ ...preview, id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` });
    setPreview(null);
  };

  const handleRetake = () => {
    setPreview(null);
  };

  if (!visible) return null;

  if (!permission?.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
        <View style={styles.permissionShell}>
          <Ionicons name="camera-outline" size={64} color={WizardTheme.colors.primary} />
          <Text style={styles.permissionTitle}>Camera permission required</Text>
          <Text style={styles.permissionBody}>
            {APP_NAME} needs the camera to capture building photos for AI damage classification.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Grant access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={onCancel}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      {preview ? (
        <PreviewReview
          photo={preview}
          onRetake={handleRetake}
          onAccept={handleAccept}
          onCancel={onCancel}
        />
      ) : (
        <View style={styles.cameraShell}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setReady(true)}
          />

          <SilhouetteOverlay />

          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconBtn} onPress={onCancel} accessibilityLabel="Close camera">
              <Ionicons name="close" size={26} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.topInfo}>
              <Text style={styles.topTitle}>{CAPTURE_GUIDANCE.title}</Text>
              <Text style={styles.topHint}>{CAPTURE_GUIDANCE.hint}</Text>
            </View>
          </View>

          <View style={styles.bottomBar}>
            <View style={styles.shutterRing}>
              <TouchableOpacity
                style={[styles.shutter, (!ready || busy) && styles.shutterDisabled]}
                onPress={handleCapture}
                disabled={!ready || busy}
                accessibilityLabel="Capture photo"
              >
                {busy ? <ActivityIndicator color="#0A4D92" /> : <View style={styles.shutterInner} />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

// ---------- Photo quality analysis ----------

async function analyzeQuality(
  pic: CameraCapturedPicture,
): Promise<Omit<CapturedPhoto, 'id'>> {
  const width = pic.width ?? 0;
  const height = pic.height ?? 0;

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    throw new Error(
      `Photo is only ${width}×${height}. Minimum ${MIN_DIMENSION}×${MIN_DIMENSION} required. Check camera quality settings.`,
    );
  }

  // Blur proxy: compare the "detail density" of a tiny recompressed copy.
  // Sharp photos preserve high-frequency texture → larger JPEG bytes per pixel.
  // Blurry photos compress tightly. This is a heuristic (true variance-of-Laplacian
  // needs raw pixel access which RN does not expose cheaply), but discriminates
  // obvious blur on real devices.
  let blurScore = 1.0;
  try {
    const tiny = await ImageManipulator.manipulateAsync(
      pic.uri,
      [{ resize: { width: 96 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );
    const info = await FileSystem.getInfoAsync(tiny.uri, { size: true });
    const pixels = (tiny.width || 96) * (tiny.height || 96);
    const size = (info.exists && 'size' in info && info.size) ? info.size : 0;
    blurScore = pixels > 0 ? size / pixels : 1.0;
  } catch {
    blurScore = 1.0;  // fail open — don't block capture on analysis errors
  }

  return {
    uri: pic.uri,
    width,
    height,
    blurScore,
    capturedAt: new Date().toISOString(),
  };
}

// ---------- Preview screen with quality verdict ----------

function PreviewReview({
  photo,
  onRetake,
  onAccept,
  onCancel,
}: {
  photo: Omit<CapturedPhoto, 'id'>;
  onRetake: () => void;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const issues = useMemo(() => collectQualityIssues(photo), [photo]);
  const hasBlockingIssue = issues.some((i) => i.severity === 'block');

  return (
    <View style={styles.previewShell}>
      <View style={styles.previewHeader}>
        <TouchableOpacity style={styles.iconBtn} onPress={onCancel} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.previewTitle}>Review Photo</Text>
        <View style={{ width: 40 }} />
      </View>

      <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="contain" />

      <View style={styles.qualityCard}>
        <Text style={styles.qualityTitle}>Quality Check</Text>
        <QualityRow
          label={`Resolution ${photo.width}×${photo.height}`}
          ok={photo.width >= MIN_DIMENSION && photo.height >= MIN_DIMENSION}
        />
        <QualityRow
          label={`Sharpness score: ${photo.blurScore.toFixed(3)}`}
          ok={photo.blurScore >= BLUR_WARN_THRESHOLD}
        />
        {issues.length > 0 ? (
          <Text style={styles.qualityIssues}>
            {issues.map((i) => `• ${i.message}`).join('\n')}
          </Text>
        ) : (
          <Text style={styles.qualityOk}>All checks passed. This photo is ready to use.</Text>
        )}
      </View>

      <View style={styles.previewActions}>
        <TouchableOpacity style={styles.ghostBtn} onPress={onRetake}>
          <Ionicons name="refresh" size={18} color={WizardTheme.colors.text} />
          <Text style={styles.ghostBtnText}>Retake</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, hasBlockingIssue && styles.primaryBtnDisabled]}
          onPress={onAccept}
          disabled={hasBlockingIssue}
        >
          <Ionicons name="checkmark" size={18} color="#FFF" />
          <Text style={styles.primaryBtnText}>Use photo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QualityRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={styles.qualityRow}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'warning'}
        size={18}
        color={ok ? WizardTheme.colors.success : WizardTheme.colors.restricted}
      />
      <Text style={styles.qualityLabel}>{label}</Text>
    </View>
  );
}

function collectQualityIssues(photo: Omit<CapturedPhoto, 'id'>) {
  const issues: { severity: 'block' | 'warn'; message: string }[] = [];
  if (photo.width < MIN_DIMENSION || photo.height < MIN_DIMENSION) {
    issues.push({
      severity: 'block',
      message: `Resolution below ${MIN_DIMENSION}×${MIN_DIMENSION}. Retake with higher camera quality.`,
    });
  }
  if (photo.blurScore < BLUR_WARN_THRESHOLD) {
    issues.push({
      severity: 'warn',
      message: 'Photo looks soft. Hold steady, tap to focus, then recapture.',
    });
  }
  return issues;
}

// ---------- Silhouette overlay ----------

function SilhouetteOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.frameMask}>
        <View style={styles.frameCenter} />
      </View>
      <GridLines />
    </View>
  );
}

function GridLines() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.gridH, { top: '33%' }]} />
      <View style={[styles.gridH, { top: '66%' }]} />
      <View style={[styles.gridV, { left: '33%' }]} />
      <View style={[styles.gridV, { left: '66%' }]} />
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  cameraShell: { flex: 1, backgroundColor: '#000' },

  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
  },
  topInfo: { flex: 1 },
  topTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  topHint: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2, lineHeight: 18 },

  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingBottom: 40, paddingTop: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  shutterRing: {
    width: 82, height: 82, borderRadius: 41,
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center', alignItems: 'center',
  },
  shutter: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#FFF',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterDisabled: { backgroundColor: '#CBD5E1' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFF' },

  frameMask: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameCenter: {
    width: '82%',
    height: '62%',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderStyle: 'dashed',
  },

  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.18)' },

  // Permission gate
  permissionShell: {
    flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: WizardTheme.colors.background, gap: 16,
  },
  permissionTitle: { fontSize: 20, fontWeight: '800', color: WizardTheme.colors.text, marginTop: 12 },
  permissionBody: { fontSize: 14, color: WizardTheme.colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // Preview
  previewShell: { flex: 1, backgroundColor: '#FFF' },
  previewHeader: {
    paddingTop: 48, paddingBottom: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: WizardTheme.colors.border,
  },
  previewTitle: { fontSize: 16, fontWeight: '800', color: WizardTheme.colors.text, flex: 1, textAlign: 'center' },
  previewImage: { flex: 1, backgroundColor: '#0F172A' },
  qualityCard: {
    borderTopWidth: 1, borderTopColor: WizardTheme.colors.border,
    padding: 16, backgroundColor: '#FFF', gap: 8,
  },
  qualityTitle: { fontSize: 14, fontWeight: '800', color: WizardTheme.colors.text, textTransform: 'uppercase', letterSpacing: 0.6 },
  qualityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qualityLabel: { fontSize: 14, color: WizardTheme.colors.text, flex: 1 },
  qualityOk: { fontSize: 13, color: WizardTheme.colors.success, marginTop: 4, fontWeight: '600' },
  qualityIssues: { fontSize: 13, color: WizardTheme.colors.restricted, marginTop: 4, lineHeight: 18 },

  previewActions: {
    flexDirection: 'row', gap: 12, padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1, borderTopColor: WizardTheme.colors.border,
  },
  primaryBtn: {
    flex: 2, flexDirection: 'row', gap: 8,
    minHeight: 48, borderRadius: 12, backgroundColor: WizardTheme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: WizardTheme.colors.pending },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  ghostBtn: {
    flex: 1, flexDirection: 'row', gap: 8,
    minHeight: 48, borderRadius: 12,
    borderWidth: 1, borderColor: WizardTheme.colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF',
  },
  ghostBtnText: { color: WizardTheme.colors.text, fontSize: 15, fontWeight: '700' },
});
