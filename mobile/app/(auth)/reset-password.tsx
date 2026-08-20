import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Text from '../../components/CustomText';
import { AuthScreen, Banner, Button, TextField } from '../../components/ui';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { supabase } from '../../services/supabase';
import { logoutUser } from '../../services/auth';
import { setPasswordRecoveryBypass } from '../../services/passwordRecovery';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const canSubmit = useMemo(
    () => password.length >= 8 && password === confirm,
    [password, confirm],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) {
          setSessionOk(Boolean(session));
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message ?? 'Could not update password.');
      setPasswordRecoveryBypass(false);
      await logoutUser();
      router.replace({ pathname: '/login', params: { flash: 'password_reset' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <AuthScreen title="Checking your link" description="One moment.">
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </AuthScreen>
    );
  }

  if (!sessionOk) {
    return (
      <AuthScreen
        title="This link isn't valid"
        footer={
          <Pressable onPress={() => router.replace('/login')} hitSlop={8}>
            <Text variant="medium" style={styles.link}>
              Back to sign in
            </Text>
          </Pressable>
        }
      >
        <Banner tone="danger">
          Open the reset link from your email on this device, or request a new one.
        </Banner>
        <Button
          label="Request a new link"
          variant="primary"
          fullWidth
          onPress={() => router.replace('/forgot-password')}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Choose a new password"
      description="You'll be signed out and asked to sign in again."
      footer={
        <Pressable onPress={() => router.replace('/login')} hitSlop={8}>
          <Text variant="medium" style={styles.link}>
            Back to sign in
          </Text>
        </Pressable>
      }
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <TextField
        label="New password"
        required
        hint="At least 8 characters."
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (error) setError('');
        }}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!submitting}
        secureToggle
        secureVisible={showPassword}
        onToggleSecure={() => setShowPassword((v) => !v)}
      />

      <TextField
        label="Confirm new password"
        required
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          if (error) setError('');
        }}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!submitting}
      />

      <Button
        label={submitting ? 'Updating…' : 'Update password'}
        variant="primary"
        fullWidth
        loading={submitting}
        disabled={!canSubmit}
        onPress={() => void handleSubmit()}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl },
  link: { color: Colors.primary, fontSize: FontSize.sm },
});
