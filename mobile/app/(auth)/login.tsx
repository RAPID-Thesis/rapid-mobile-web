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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import Text from '../../components/CustomText';
import { loginUser } from '../../services/auth';

const InterfaceTheme = {
  accent: Colors.primary,
  steel: '#334155',
};

export default function LoginScreen() {
  const params = useLocalSearchParams<{ error?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    params.error === 'pending' ? 'Your account is still pending admin approval.' : ''
  );
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.length > 0, [email, password]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) setEmailError('');
    if (error) setError('');
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (passwordError) setPasswordError('');
    if (error) setError('');
  };

  const handleLogin = async () => {
    const normalizedEmail = email.trim();
    let hasError = false;

    setError('');
    setEmailError('');
    setPasswordError('');

    if (!normalizedEmail) {
      setEmailError('Email is required');
      hasError = true;
    } else if (!normalizedEmail.includes('@')) {
      setEmailError('Enter a valid email address');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    }

    if (hasError) {
      setError('Please fix the highlighted fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await loginUser(normalizedEmail, password);
      router.replace('/');
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : 'Unable to sign in. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
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
        <View style={styles.screen}>
          <View style={styles.inner}>
            <View style={styles.formCard}>
              <View style={styles.logoMark}>
                <Ionicons name="shield-checkmark" size={36} color={Colors.primary} />
              </View>
              <Text style={styles.logoWordmark}>RAPID</Text>

              <Text style={styles.cardTitle}>Welcome</Text>

              <Text style={styles.cardSubtitle}>
                Sign in to continue building assessments, risk reviews, and post-earthquake
                inspections.
              </Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Government Email Address</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldHint}>you@lgu.gov.ph</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="next"
                />
                {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldHint}>Enter password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={password}
                    onChangeText={handlePasswordChange}
                    secureTextEntry={!showPassword}
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword((prev) => !prev)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.passwordToggleText}>
                      {showPassword ? 'Hide' : 'Show'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
              </View>

              <View style={styles.inlineRow}>
                <Text style={styles.inlineText}>Official LGU account required</Text>
                <TouchableOpacity onPress={() => router.push('/register')} activeOpacity={0.8}>
                  <Text style={styles.inlineTextAction}>Sign up</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.button, (!canSubmit || isSubmitting) && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? (
                  <View style={styles.buttonLoading}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.buttonText}>Signing In...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.offlineSecondary}
                onPress={() => router.replace('/(tabs)')}
                activeOpacity={0.85}
              >
                <Text style={styles.offlineSecondaryText}>Continue offline</Text>
                <Text style={styles.offlineSecondaryHint}>
                  Capture assessments now. Sign in or sign up later to upload.
                </Text>
              </TouchableOpacity>

              <View style={styles.metaRow}>
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>Assessment</Text>
                </View>
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>Prediction</Text>
                </View>
              </View>

              <View style={styles.securityBox}>
                <Text style={styles.securityTitle}>Security Advisory</Text>
                <Text style={styles.notice}>
                  Access is limited to authorized personnel. System activity may be logged and
                  monitored for operational and compliance purposes.
                </Text>
              </View>
            </View>

            <Text style={styles.footer}>FEMA P-154 • ATC-20 • Activity May Be Monitored</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    backgroundColor: 'transparent',
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
  metaBadge: {
    backgroundColor: 'rgba(229,231,235,0.9)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  metaBadgeText: {
    color: InterfaceTheme.steel,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...platformShadow('#0F172A', { width: 0, height: 12 }, 0.18, 22, 8),
    maxWidth: 300,
    alignSelf: 'center',
    width: '100%',
  },
  cardEyebrow: {
    color: InterfaceTheme.accent,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: Spacing.xs,
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
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: Spacing.xs,
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
  inputGroup: {
    marginBottom: Spacing.sm,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  fieldHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: 6,
    marginLeft: 2,
  },
  fieldError: {
    color: Colors.error,
    fontSize: FontSize.xs,
    marginTop: 6,
    marginLeft: 2,
  },
  passwordInput: {
    flex: 1,
  },
  passwordToggle: {
    height: MinTouchTarget,
    minWidth: 56,
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.9)',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  passwordToggleText: {
    color: InterfaceTheme.steel,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  inlineText: {
    color: InterfaceTheme.steel,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  inlineTextAction: {
    color: InterfaceTheme.accent,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  button: {
    height: MinTouchTarget,
    backgroundColor: '#111827',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: '#111827',
    ...platformShadow('#111827', { width: 0, height: 4 }, 0.16, 8, 3),
  },
  buttonDisabled: {
    backgroundColor: '#6B7280',
    borderColor: '#6B7280',
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  offlineSecondary: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
  },
  offlineSecondaryText: {
    color: InterfaceTheme.accent,
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  offlineSecondaryHint: {
    color: '#64748B',
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  securityBox: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(203,213,225,0.9)',
  },
  securityTitle: {
    color: '#1F2937',
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  notice: {
    color: '#4B5563',
    fontSize: FontSize.xs,
    lineHeight: 18,
    textAlign: 'center',
  },
  error: {
    color: Colors.error,
    fontSize: FontSize.sm,
    textAlign: 'left',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  footer: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
