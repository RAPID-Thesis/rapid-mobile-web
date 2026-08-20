import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import CustomText from '../CustomText';
import { BorderRadius, Colors, FontSize, MinTouchTarget, Spacing } from '../../constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  /** Overrides the label for screen readers when the label alone is ambiguous. */
  accessibilityLabel?: string;
}

/**
 * Every screen previously hand-rolled its own button — differing heights,
 * radii and blues. This is the one implementation.
 *
 * Destructive actions are outlined rather than filled so a red button never
 * competes with the UNSAFE classification colour, which must stay the loudest
 * red in the app.
 */
export default function Button({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        VARIANT_STYLE[variant],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && PRESSED_STYLE[variant],
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#FFFFFF' : Colors.primary}
          style={styles.spinner}
        />
      )}
      <CustomText
        variant="medium"
        style={[
          styles.label,
          size === 'sm' ? styles.labelSm : styles.labelMd,
          { color: LABEL_COLOR[variant] },
        ]}
        numberOfLines={1}
      >
        {label}
      </CustomText>
    </Pressable>
  );
}

const VARIANT_STYLE: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  secondary: { backgroundColor: Colors.surface, borderColor: Colors.borderStrong },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: Colors.surface, borderColor: Colors.unsafeBorder },
};

const PRESSED_STYLE: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  secondary: { backgroundColor: Colors.surfaceSoft },
  ghost: { backgroundColor: Colors.surfaceSoft },
  danger: { backgroundColor: Colors.unsafeBg },
};

const LABEL_COLOR: Record<Variant, string> = {
  primary: '#FFFFFF',
  secondary: Colors.text,
  ghost: Colors.textSecondary,
  danger: Colors.unsafe,
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.control,
    paddingHorizontal: Spacing.md,
  },
  // Both sizes clear the 48px field-use target; `sm` only reduces padding.
  md: { minHeight: MinTouchTarget },
  sm: { minHeight: MinTouchTarget, paddingHorizontal: Spacing.ms },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  disabled: { opacity: 0.45 },
  spinner: { marginRight: Spacing.sm },
  label: { textAlign: 'center' },
  labelMd: { fontSize: FontSize.md },
  labelSm: { fontSize: FontSize.sm },
});

/** Icon-only control. `accessibilityLabel` is required — an icon has no name. */
export function IconButton({
  children,
  onPress,
  accessibilityLabel,
  disabled = false,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        iconStyles.base,
        pressed && !disabled && { backgroundColor: Colors.surfaceSoft },
        disabled && styles.disabled,
        style,
      ]}
    >
      <View pointerEvents="none">{children}</View>
    </Pressable>
  );
}

const iconStyles = StyleSheet.create({
  base: {
    // Several wizard controls were 36-40px, below the app's own declared
    // MinTouchTarget of 48 and awkward to hit with gloves or wet hands.
    width: MinTouchTarget,
    height: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.control,
  },
});
