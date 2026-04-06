import { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ImageBackground,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import Text from '../../components/CustomText';
import { loginUser } from '../../services/auth';

const InterfaceTheme = {
  accent: Colors.primary,
  steel: '#334155',
};
const backgroundImage = require('../../assets/bumbum.png');
const brandingImage = require('../../assets/bumbum.png');

export default function LoginScreen() {
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
      <ImageBackground
        source={backgroundImage}
        style={[styles.backgroundImage, { width, height }]}
        imageStyle={styles.backgroundImageStyle}
        resizeMode="cover"
      >
        <View style={styles.backgroundOverlay}>
          <View style={styles.backgroundTint} />
        </View>
      </ImageBackground>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.screen}>
          <View style={styles.inner}>
            <View style={styles.formCard}>
              <Image
                source={brandingImage}
                style={styles.cardLogo}
              />
              
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
                <Text style={styles.inlineTextAction}>Need help?</Text>
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
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImageStyle: {
    opacity:0.5
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(77, 90, 118, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundTint: {
    width: '180%',
    height: '180%',
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    transform: [{ rotate: '-12deg' }],
  },
  imageCaption: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  imageCaptionLabel: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  imageCaptionTitle: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
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
  cardLogo: {
    width: 86,
    height: 86,
    borderRadius: BorderRadius.full,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
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
