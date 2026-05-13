import { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import Text from '../../components/CustomText';
import { requestPasswordReset } from '../../services/auth';

const InterfaceTheme = {
  accent: Colors.primary,
  steel: '#334155',
};

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 0 && email.trim().includes('@'), [email]);

  const handleSubmit = async () => {
    const normalized = email.trim();
    setError('');
    if (!normalized || !normalized.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(normalized);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#1E4E8D', '#153A69', '#0F294A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>
            <View style={styles.formCard}>
              <View style={styles.logoMark}>
                <Ionicons name="mail-outline" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.logoWordmark}>RAPID</Text>
              <Text style={styles.cardTitle}>Forgot password</Text>
              <Text style={styles.cardSubtitle}>
                If an account exists for that email, you will receive a link to set a new password. In
                Supabase → Auth → Redirect URLs, add{' '}
                <Text style={styles.mono}>rapid://reset-password</Text>.
              </Text>

              {sent ? (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>
                    Check your inbox. Open the link on this device to set a new password.
                  </Text>
                </View>
              ) : (
                <>
                  {error ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.error}>{error}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.label}>Email</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.fieldHint}>you@lgu.gov.ph</Text>
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        if (error) setError('');
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={!canSubmit || submitting}
                  >
                    {submitting ? (
                      <View style={styles.buttonLoading}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.buttonText}>Sending…</Text>
                      </View>
                    ) : (
                      <Text style={styles.buttonText}>Send reset link</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => router.replace('/login')}
                activeOpacity={0.85}
              >
                <Text style={styles.backLinkText}>Back to sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.lg },
  inner: { paddingHorizontal: Spacing.md },
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...platformShadow('#0F172A', { width: 0, height: 12 }, 0.18, 22, 8),
    maxWidth: 340,
    alignSelf: 'center',
    width: '100%',
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.xs,
    borderWidth: 2,
    borderColor: 'rgba(10, 77, 146, 0.2)',
  },
  logoWordmark: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    color: InterfaceTheme.accent,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    color: '#374151',
    fontSize: FontSize.xs,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: FontSize.xs,
    color: '#111827',
    fontWeight: '600',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: Spacing.xs,
  },
  inputGroup: { marginBottom: Spacing.md },
  fieldHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: 6,
    marginLeft: 2,
  },
  input: {
    height: MinTouchTarget,
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.9)',
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  button: {
    height: MinTouchTarget,
    backgroundColor: '#111827',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: '#111827',
    ...platformShadow('#111827', { width: 0, height: 4 }, 0.16, 8, 3),
  },
  buttonDisabled: { backgroundColor: '#6B7280', borderColor: '#6B7280' },
  buttonLoading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  buttonText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  error: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '600' },
  successBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  successText: { color: '#065F46', fontSize: FontSize.sm, lineHeight: 20 },
  backLink: { marginTop: Spacing.lg, alignItems: 'center', paddingVertical: Spacing.sm },
  backLinkText: { color: InterfaceTheme.accent, fontSize: FontSize.sm, fontWeight: '700' },
});
