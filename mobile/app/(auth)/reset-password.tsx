import { useEffect, useMemo, useState } from 'react';
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
import { APP_NAME } from '../../constants/branding';
import { platformShadow } from '../../utils/platformShadow';
import Text from '../../components/CustomText';
import { supabase } from '../../services/supabase';
import { logoutUser } from '../../services/auth';
import { setPasswordRecoveryBypass } from '../../services/passwordRecovery';

const InterfaceTheme = {
  accent: Colors.primary,
  steel: '#334155',
};

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => password.length >= 8 && password === confirm,
    [password, confirm]
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
      <View style={[styles.root, styles.centered]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (!sessionOk) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <LinearGradient
          colors={['#1E4E8D', '#153A69', '#0F294A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.inner}>
          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Link invalid or expired</Text>
            <Text style={styles.cardSubtitle}>
              Open the reset link from your email on this device, or request a new one.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace('/forgot-password')}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>Request new link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/login')}>
              <Text style={styles.backLinkText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

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
                <Ionicons name="key-outline" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.logoWordmark}>{APP_NAME}</Text>
              <Text style={styles.cardTitle}>Set new password</Text>
              <Text style={styles.cardSubtitle}>
                Choose a strong password you have not used elsewhere.
              </Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>New password</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldHint}>At least 8 characters</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (error) setError('');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Confirm password</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldHint}>Repeat password</Text>
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={(t) => {
                    setConfirm(t);
                    if (error) setError('');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
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
                    <Text style={styles.buttonText}>Saving…</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Update password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => {
                  setPasswordRecoveryBypass(false);
                  void logoutUser();
                  router.replace('/login');
                }}
              >
                <Text style={styles.backLinkText}>Cancel</Text>
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
  centered: { justifyContent: 'center', alignItems: 'center' },
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
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: Spacing.xs,
  },
  inputGroup: { marginBottom: Spacing.sm },
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
    marginTop: Spacing.md,
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
  backLink: { marginTop: Spacing.lg, alignItems: 'center', paddingVertical: Spacing.sm },
  backLinkText: { color: InterfaceTheme.steel, fontSize: FontSize.sm, fontWeight: '600' },
});
