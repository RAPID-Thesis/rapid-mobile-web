import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Text from '../../components/CustomText';
import { AuthScreen, Banner, Button, TextField } from '../../components/ui';
import { BorderRadius, Colors, FontSize, MinTouchTarget, Spacing } from '../../constants/theme';
import { signUpUser } from '../../services/auth';

type RoleOption = 'inspector' | 'admin' | 'engineer';

const ROLES: { value: RoleOption; label: string; hint: string }[] = [
  { value: 'inspector', label: 'Field inspector', hint: 'Captures assessments in the field.' },
  { value: 'engineer', label: 'Engineer', hint: 'Reviews classifications and signs off records.' },
  { value: 'admin', label: 'Administrator', hint: 'Manages accounts and settings.' },
];

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleOption>('inspector');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && email.trim().length > 0 && password.length > 0,
    [name, email, password],
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
        [{ text: 'OK', onPress: () => router.replace('/login') }],
      );
    } catch (signupError) {
      setError(
        signupError instanceof Error
          ? signupError.message
          : 'Unable to submit registration. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeRole = ROLES.find((r) => r.value === role);

  return (
    <AuthScreen
      title="Request access"
      description="New accounts are reviewed by an administrator before they can sign in."
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Pressable onPress={() => router.replace('/login')} hitSlop={8}>
            <Text variant="medium" style={styles.link}>
              Sign in
            </Text>
          </Pressable>
        </View>
      }
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <TextField
        label="Full name"
        required
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (error) setError('');
        }}
        placeholder="Juan dela Cruz"
        autoCapitalize="words"
        autoComplete="name"
        editable={!isSubmitting}
      />

      <TextField
        label="Email"
        required
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (error) setError('');
        }}
        placeholder="you@lgu.gov.ph"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        editable={!isSubmitting}
      />

      <TextField
        label="Password"
        required
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (error) setError('');
        }}
        hint="At least 8 characters."
        placeholder="Choose a password"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!isSubmitting}
        secureToggle
        secureVisible={showPassword}
        onToggleSecure={() => setShowPassword((v) => !v)}
      />

      {/* Segmented role picker — the old screen used a row of custom pills with
          no accessibility state, so a screen reader could not tell which was
          selected. */}
      <View>
        <Text variant="medium" style={styles.label}>
          Role <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {ROLES.map((option) => {
            const selected = option.value === role;
            return (
              <Pressable
                key={option.value}
                onPress={() => setRole(option.value)}
                disabled={isSubmitting}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: isSubmitting }}
                accessibilityLabel={option.label}
                style={[styles.segmentItem, selected && styles.segmentItemActive]}
              >
                <Text
                  variant={selected ? 'bold' : 'body'}
                  style={[styles.segmentText, selected && styles.segmentTextActive]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {activeRole ? <Text style={styles.hint}>{activeRole.hint}</Text> : null}
      </View>

      <Button
        label={isSubmitting ? 'Submitting…' : 'Submit for approval'}
        variant="primary"
        fullWidth
        loading={isSubmitting}
        disabled={!canSubmit}
        onPress={() => void handleSubmit()}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 6 },
  required: { color: Colors.unsafe },
  hint: { fontSize: FontSize.xxs, color: Colors.textMuted, marginTop: 6 },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: BorderRadius.control,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  segmentItemActive: { backgroundColor: Colors.primaryTint },
  segmentText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  segmentTextActive: { color: Colors.primary },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  footerText: { color: Colors.textMuted, fontSize: FontSize.sm },
  link: { color: Colors.primary, fontSize: FontSize.sm },
});
