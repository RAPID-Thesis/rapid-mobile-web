import { StyleSheet, View, type ViewStyle } from 'react-native';
import CustomText from '../CustomText';
import { BorderRadius, Colors, Elevation, FontSize, Spacing } from '../../constants/theme';

/** Surface primitive. Depth is a hairline border by default; `raised` is the
 *  only elevated step. */
export function Card({
  children,
  raised = false,
  style,
}: {
  children: React.ReactNode;
  raised?: boolean;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, raised && Elevation.raised, style]}>{children}</View>;
}

export function CardHeader({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <CustomText variant="bold" style={styles.headerTitle}>
          {title}
        </CustomText>
        {description ? (
          <CustomText style={styles.headerDescription}>{description}</CustomText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function CardBody({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.body, style]}>{children}</View>;
}

/** Label / value row used across the detail and review screens. */
export function DataRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <CustomText style={styles.rowLabel}>{label}</CustomText>
      <View style={styles.rowValue}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <CustomText variant="medium" style={styles.rowValueText}>
            {value}
          </CustomText>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

type BannerTone = 'info' | 'warn' | 'danger' | 'ok';

const TONES: Record<BannerTone, { fg: string; bg: string; border: string }> = {
  info: { fg: Colors.primaryDark, bg: Colors.infoBg, border: Colors.infoBorder },
  warn: { fg: Colors.restricted, bg: Colors.restrictedBg, border: Colors.restrictedBorder },
  danger: { fg: Colors.unsafe, bg: Colors.unsafeBg, border: Colors.unsafeBorder },
  ok: { fg: Colors.safe, bg: Colors.safeBg, border: Colors.safeBorder },
};

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  style,
}: {
  tone?: BannerTone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  style?: ViewStyle;
}) {
  const c = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }, style]}>
      {title ? (
        <CustomText variant="bold" style={[styles.bannerTitle, { color: c.fg }]}>
          {title}
        </CustomText>
      ) : null}
      {typeof children === 'string' ? (
        <CustomText style={[styles.bannerText, { color: c.fg }]}>{children}</CustomText>
      ) : (
        children
      )}
      {action ? <View style={styles.bannerAction}>{action}</View> : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
  style,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.empty, style]}>
      <CustomText variant="bold" style={styles.emptyTitle}>
        {title}
      </CustomText>
      {description ? (
        <CustomText style={styles.emptyDescription}>{description}</CustomText>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.ms,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.ms,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: FontSize.sm, color: Colors.text },
  headerDescription: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  body: { padding: Spacing.md },

  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLabel: { fontSize: FontSize.xs, color: Colors.textMuted, flexShrink: 0 },
  rowValue: { flex: 1, alignItems: 'flex-end' },
  rowValueText: { fontSize: FontSize.sm, color: Colors.text, textAlign: 'right' },

  banner: {
    borderWidth: 1,
    borderRadius: BorderRadius.card,
    paddingHorizontal: Spacing.ms,
    paddingVertical: Spacing.sm + 2,
  },
  bannerTitle: { fontSize: FontSize.sm },
  bannerText: { fontSize: FontSize.xs, marginTop: 2, lineHeight: 18 },
  bannerAction: { marginTop: Spacing.sm, alignSelf: 'flex-start' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: FontSize.sm, color: Colors.text, textAlign: 'center' },
  emptyDescription: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 320,
  },
  emptyAction: { marginTop: Spacing.md },
});
