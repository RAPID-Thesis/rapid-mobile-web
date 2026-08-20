import { StyleSheet, View, type ViewStyle } from 'react-native';
import CustomText from '../CustomText';
import { BorderRadius, Colors, FontSize, Spacing } from '../../constants/theme';

/* ============================================================================
   Status vocabulary
   ----------------------------------------------------------------------------
   Sync state was previously rendered three different ways on three screens
   (coloured dot + label on the list, a plain sentence on the detail view, a
   banner on the Sync tab), and prediction source was plain grey text in all
   three. These components make each signal look the same everywhere it appears.
   ========================================================================= */

export type Severity = 'safe' | 'restricted' | 'unsafe' | 'unknown';

const SEVERITY_BY_LABEL: Record<string, Severity> = {
  low: 'safe',
  safe: 'safe',
  moderate: 'restricted',
  restricted: 'restricted',
  high: 'unsafe',
  unsafe: 'unsafe',
};

export function severityOf(label: string | null | undefined): Severity {
  if (!label) return 'unknown';
  return SEVERITY_BY_LABEL[label.trim().toLowerCase()] ?? 'unknown';
}

export const SEVERITY_MEANING: Record<Severity, string> = {
  safe: 'Normal occupancy',
  restricted: 'Limited entry',
  unsafe: 'Do not enter',
  unknown: 'Not yet classified',
};

/** Below this the prediction reads as unresolved rather than merely weaker. */
export const REVIEW_THRESHOLD = 0.7;

const SEVERITY_COLORS: Record<Severity, { fg: string; bg: string; border: string }> = {
  safe: { fg: Colors.safe, bg: Colors.safeBg, border: Colors.safeBorder },
  restricted: { fg: Colors.restricted, bg: Colors.restrictedBg, border: Colors.restrictedBorder },
  unsafe: { fg: Colors.unsafe, bg: Colors.unsafeBg, border: Colors.unsafeBorder },
  unknown: { fg: Colors.textMuted, bg: Colors.surfaceSoft, border: Colors.border },
};

export function ClassificationBadge({
  label,
  size = 'md',
  style,
}: {
  label: string | null | undefined;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}) {
  const severity = severityOf(label);
  const c = SEVERITY_COLORS[severity];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: c.bg, borderColor: c.border },
        size === 'sm' && styles.badgeSm,
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Classification ${label ?? 'not set'}. ${SEVERITY_MEANING[severity]}`}
    >
      <View style={[styles.dot, { backgroundColor: c.fg }]} />
      <CustomText
        variant="bold"
        style={[styles.badgeText, size === 'sm' && styles.badgeTextSm, { color: c.fg }]}
      >
        {(label ?? 'UNCLASSIFIED').toUpperCase()}
      </CustomText>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

export type SyncState = 'pending' | 'syncing' | 'failed' | 'synced';

const SYNC_COPY: Record<SyncState, { text: string; fg: string; bg: string; border: string }> = {
  pending: {
    text: 'Waiting to sync',
    fg: Colors.statusPendingSync,
    bg: Colors.surfaceSoft,
    border: Colors.border,
  },
  syncing: {
    text: 'Syncing…',
    fg: Colors.statusSyncing,
    bg: Colors.infoBg,
    border: Colors.infoBorder,
  },
  failed: {
    text: 'Upload failed',
    fg: Colors.statusFailed,
    bg: Colors.unsafeBg,
    border: Colors.unsafeBorder,
  },
  synced: {
    text: 'Synced',
    fg: Colors.statusReviewed,
    bg: Colors.safeBg,
    border: Colors.safeBorder,
  },
};

export function SyncStatusBadge({ state, style }: { state: SyncState; style?: ViewStyle }) {
  const c = SYNC_COPY[state];
  return (
    <View style={[styles.badge, styles.badgeSm, { backgroundColor: c.bg, borderColor: c.border }, style]}>
      <View style={[styles.dot, { backgroundColor: c.fg }]} />
      <CustomText variant="medium" style={[styles.badgeTextSm, { color: c.fg }]}>
        {c.text}
      </CustomText>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Where the on-device prediction came from.
 *
 * `device-offline-heuristic` means the TFLite/ONNX models were unavailable and
 * a rule-based fallback ran — materially less trustworthy, and previously shown
 * only as small grey text that an inspector could easily miss.
 */
export function PredictionSourceBadge({
  source,
  style,
}: {
  source: string | null | undefined;
  style?: ViewStyle;
}) {
  if (!source) return null;
  const heuristic = source.includes('heuristic');

  const fg = heuristic ? Colors.restricted : Colors.primary;
  const bg = heuristic ? Colors.restrictedBg : Colors.primaryTint;
  const border = heuristic ? Colors.restrictedBorder : Colors.primaryBorder;
  const text = heuristic ? 'Offline estimate' : 'On-device model';

  return (
    <View
      style={[styles.badge, styles.badgeSm, { backgroundColor: bg, borderColor: border }, style]}
      accessibilityRole="text"
      accessibilityLabel={
        heuristic
          ? 'Offline estimate. The machine-learning models were unavailable, so a rule-based fallback was used. Treat as provisional.'
          : 'Computed with the full on-device model.'
      }
    >
      <CustomText variant="medium" style={[styles.badgeTextSm, { color: fg }]}>
        {heuristic ? '⚠ ' : ''}
        {text}
      </CustomText>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  style,
}: {
  children: string;
  tone?: 'neutral' | 'brand';
  style?: ViewStyle;
}) {
  const fg = tone === 'brand' ? Colors.primary : Colors.textSecondary;
  const bg = tone === 'brand' ? Colors.primaryTint : Colors.surfaceSoft;
  const border = tone === 'brand' ? Colors.primaryBorder : Colors.border;
  return (
    <View style={[styles.badge, styles.badgeSm, { backgroundColor: bg, borderColor: border }, style]}>
      <CustomText variant="medium" style={[styles.badgeTextSm, { color: fg }]}>
        {children}
      </CustomText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.control,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  badgeSm: { paddingHorizontal: 6, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: BorderRadius.full },
  badgeText: { fontSize: FontSize.xs, letterSpacing: 0.4 },
  badgeTextSm: { fontSize: FontSize.xxs, letterSpacing: 0.3 },
});
