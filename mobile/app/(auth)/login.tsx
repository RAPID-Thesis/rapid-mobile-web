import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Text from '../../components/CustomText';
import { AuthScreen, Banner, Button, TextField } from '../../components/ui';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { loginUser } from '../../services/auth';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ error?: string; flash?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    params.error === 'pending' ? 'Your account is still pending admin approval.' : '',
  );
  const [successBanner, setSuccessBanner] = useState(
    params.flash === 'password_reset'
      ? 'Your password was updated. Sign in with your new password.'
      : '',
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
    if (successBanner) setSuccessBanner('');
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (passwordError) setPasswordError('');
    if (error) setError('');
    if (successBanner) setSuccessBanner('');
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

    if (hasError) return;

    setIsSubmitting(true);
    try {
      await loginUser(normalizedEmail, password);
      router.replace('/');
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : 'Unable to sign in. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Sign in"
      description="Use the account issued by your LGU administrator."
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Need an account?</Text>
          <Pressable onPress={() => router.push('/register')} hitSlop={8}>
            <Text variant="medium" style={styles.link}>
              Request access
            </Text>
          </Pressable>
        </View>
      }
    >
      {successBanner ? <Banner tone="ok">{successBanner}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <TextField
        label="Email"
        required
        value={email}
        onChangeText={handleEmailChange}
        error={emailError}
        placeholder="you@lgu.gov.ph"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        editable={!isSubmitting}
      />

      <TextField
        label="Password"
        required
        value={password}
        onChangeText={handlePasswordChange}
        error={passwordError}
        placeholder="Enter password"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        editable={!isSubmitting}
        secureToggle
        secureVisible={showPassword}
        onToggleSecure={() => setShowPassword((v) => !v)}
      />

      <Pressable
        onPress={() => router.push('/forgot-password')}
        hitSlop={8}
        style={styles.forgotWrap}
      >
        <Text variant="medium" style={styles.link}>
          Forgot password?
        </Text>
      </Pressable>

      <Button
        label={isSubmitting ? 'Signing in…' : 'Sign in'}
        variant="primary"
        fullWidth
        loading={isSubmitting}
        disabled={!canSubmit}
        onPress={() => void handleLogin()}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgotWrap: { alignSelf: 'flex-end' },
  link: { color: Colors.primary, fontSize: FontSize.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  footerText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
