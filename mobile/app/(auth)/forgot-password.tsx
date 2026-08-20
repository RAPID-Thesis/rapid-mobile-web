import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Text from '../../components/CustomText';
import { AuthScreen, Banner, Button, TextField } from '../../components/ui';
import { Colors, FontSize } from '../../constants/theme';
import { requestPasswordReset } from '../../services/auth';

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
    <AuthScreen
      title="Reset password"
      description="We'll email you a link to choose a new one."
      footer={
        <Pressable onPress={() => router.replace('/login')} hitSlop={8}>
          <Text variant="medium" style={styles.link}>
            Back to sign in
          </Text>
        </Pressable>
      }
    >
      {sent ? (
        <Banner tone="ok" title="Check your inbox">
          {`If an account exists for ${email.trim()}, a reset link is on its way. The link expires shortly.`}
        </Banner>
      ) : (
        <>
          <TextField
            label="Email"
            required
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (error) setError('');
            }}
            error={error}
            hint="Use the address your account was registered with."
            placeholder="you@lgu.gov.ph"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            editable={!submitting}
          />

          <Button
            label={submitting ? 'Sending…' : 'Send reset link'}
            variant="primary"
            fullWidth
            loading={submitting}
            disabled={!canSubmit}
            onPress={() => void handleSubmit()}
          />
        </>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  link: { color: Colors.primary, fontSize: FontSize.sm },
});
