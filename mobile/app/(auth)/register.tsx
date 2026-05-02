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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import Text from '../../components/CustomText';
import { signUpUser } from '../../services/auth';

const InterfaceTheme = {
  accent: Colors.primary,
  steel: '#334155',
};

type RoleOption = 'inspector' | 'admin' | 'engineer';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleOption>('inspector');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && email.trim().length > 0 && password.length > 0,
    [name, email, password]
  );

  const handleSubmit = async () => {
    const normalizedEmail = email.trim();
    if (!name.trim() || !normalizedEmail || !password) {
      setError('Please complete all required fields.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await signUpUser({
        email: normalizedEmail,
        password,
        full_name: name.trim(),
        role,
      });
      Alert.alert(
        'Submitted',
        'Your account has been submitted and is pending review by an admin.',
        [{ text: 'OK', onPress: () => router.replace('/login') }]
      );
    } catch (signupError) {
      setError(
        signupError instanceof Error
          ? signupError.message
          : 'Unable to submit registration. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions: RoleOption[] = ['inspector', 'admin', 'engineer'];

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

              <Text style={styles.cardTitle}>Create Account</Text>
              <Text style={styles.cardSubtitle}>
                Register your official account. New signups require admin approval before access.
              </Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Name/Details</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldHint}>Full name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Government Email Address</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldHint}>you@lgu.gov.ph</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldHint}>Enter password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>

              <Text style={styles.label}>Role</Text>
              <View style={styles.roleRow}>
                {roleOptions.map((option) => {
                  const selected = role === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      onPress={() => setRole(option)}
                      style={[styles.roleChip, selected && styles.roleChipSelected]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.button, (!canSubmit || isSubmitting) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? (
                  <View style={styles.buttonLoading}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.buttonText}>Submitting...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Submit for Approval</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.offlineSecondary}
                onPress={() => router.replace('/(tabs)')}
                activeOpacity={0.85}
              >
                <Text style={styles.offlineSecondaryText}>Skip for now and work offline</Text>
                <Text style={styles.offlineSecondaryHint}>
                  You can create an account later when internet is available.
                </Text>
              </TouchableOpacity>

              <View style={styles.inlineRow}>
                <Text style={styles.inlineText}>Already have an account?</Text>
                <TouchableOpacity onPress={() => router.replace('/login')} activeOpacity={0.8}>
                  <Text style={styles.inlineTextAction}>Sign in</Text>
                </TouchableOpacity>
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
  fieldHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: 6,
    marginLeft: 2,
  },
  roleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  roleChip: {
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.9)',
    borderRadius: BorderRadius.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  roleChipSelected: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  roleChipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: InterfaceTheme.steel,
  },
  roleChipTextSelected: {
    color: '#FFFFFF',
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
    marginTop: Spacing.sm,
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
  footer: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
