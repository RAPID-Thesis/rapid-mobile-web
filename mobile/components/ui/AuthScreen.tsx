import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomText from '../CustomText';
import { IconButton } from './Button';
import { BorderRadius, Colors, FontSize, MinTouchTarget, Spacing } from '../../constants/theme';
import { APP_NAME } from '../../constants/branding';

/**
 * Shared shell for the four auth screens.
 *
 * Replaces a full-bleed blue gradient plus a translucent 300–340px "glass" card
 * that was reimplemented — styles and all — in login, register, forgot-password
 * and reset-password. Four copies meant four slightly different cards.
 *
 * The institutional header carries the CDRRMO seal, which is what makes this
 * read as a municipal instrument rather than a generic app login.
 */
export function AuthScreen({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Real device insets rather than the hardcoded paddingTop: 48 the auth
          screens used, which clipped on notched devices. */}
      <View style={[styles.masthead, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.mastheadRow}>
          <Image
            source={require('../../assets/cdrrmo-logo.png')}
            style={styles.seal}
            accessibilityIgnoresInvertColors
            alt=""
          />
          <View style={styles.mastheadText}>
            <CustomText variant="bold" style={styles.wordmark}>
              {APP_NAME}
            </CustomText>
            <CustomText style={styles.mastheadSub}>
              City Disaster Risk Reduction &amp; Management Office
            </CustomText>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.panel}>
            <CustomText variant="bold" style={styles.title}>
              {title}
            </CustomText>
            {description ? (
              <CustomText style={styles.description}>{description}</CustomText>
            ) : null}

            <View style={styles.form}>{children}</View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>

          <CustomText style={styles.legal}>
            Screening follows FEMA P-154 and ATC-20.
          </CustomText>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Labelled text field with hint and error wiring.
 *
 * The old screens used a placeholder as the label, which disappears the moment
 * the user types, and signalled errors with red text alone.
 */
export function TextField({
  label,
  hint,
  error,
  required,
  secureToggle,
  secureVisible,
  onToggleSecure,
  ...inputProps
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Renders a show/hide control for password fields. */
  secureToggle?: boolean;
  secureVisible?: boolean;
  onToggleSecure?: () => void;
}) {
  const invalid = Boolean(error);

  return (
    <View style={styles.field}>
      <CustomText variant="medium" style={styles.label}>
        {label}
        {required ? <CustomText style={styles.required}> *</CustomText> : null}
      </CustomText>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, invalid && styles.inputInvalid, secureToggle && styles.inputWithToggle]}
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel={label}
          accessibilityHint={hint}
          {...inputProps}
        />
        {secureToggle ? (
          <IconButton
            accessibilityLabel={secureVisible ? 'Hide password' : 'Show password'}
            onPress={onToggleSecure}
            style={styles.toggle}
          >
            <CustomText variant="medium" style={styles.toggleText}>
              {secureVisible ? 'Hide' : 'Show'}
            </CustomText>
          </IconButton>
        ) : null}
      </View>

      {error ? (
        <CustomText style={styles.error}>{error}</CustomText>
      ) : hint ? (
        <CustomText style={styles.hint}>{hint}</CustomText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  flex: { flex: 1 },

  masthead: {
    backgroundColor: Colors.primaryDeep,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  mastheadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms },
  seal: { width: 44, height: 44, borderRadius: BorderRadius.full, backgroundColor: '#FFFFFF' },
  mastheadText: { flex: 1, minWidth: 0 },
  wordmark: { color: '#FFFFFF', fontSize: FontSize.lg, letterSpacing: 0.3 },
  mastheadSub: { color: 'rgba(255,255,255,0.62)', fontSize: FontSize.xxs, marginTop: 1 },

  scroll: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },
  panel: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  title: { fontSize: FontSize.xl, color: Colors.text },
  description: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4, lineHeight: 20 },
  form: { marginTop: Spacing.lg, gap: Spacing.md },
  footer: { marginTop: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  legal: {
    fontSize: FontSize.xxs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },

  field: { gap: 6 },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary },
  required: { color: Colors.unsafe },
  inputRow: { position: 'relative', justifyContent: 'center' },
  input: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: BorderRadius.control,
    paddingHorizontal: Spacing.ms,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputWithToggle: { paddingRight: MinTouchTarget + Spacing.sm },
  inputInvalid: { borderColor: Colors.unsafeBorder, backgroundColor: Colors.unsafeBg },
  toggle: { position: 'absolute', right: 0 },
  toggleText: { fontSize: FontSize.xs, color: Colors.primary },
  hint: { fontSize: FontSize.xxs, color: Colors.textMuted },
  error: { fontSize: FontSize.xxs, color: Colors.unsafe },
});
