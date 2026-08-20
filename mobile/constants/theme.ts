import { platformShadow } from '../utils/platformShadow';

/* ============================================================================
   RADAR design tokens — single source of truth
   ----------------------------------------------------------------------------
   This file previously coexisted with constants/wizardTheme.ts, which defined a
   second, numerically different system: primary #0A4D92 vs #1B4D8E, background
   #F4F6F8 vs #F1F5F9, radii 8/12/14 vs 6/10/16/20, and its own success/warning
   /error triad. Two design systems in one app guarantee drift, and both were in
   use on adjacent screens.

   Everything now resolves to the values below, which match the portal's tokens
   in web/src/index.css so the two surfaces read as one product.

   Two rules govern the palette:

   1. Blue is the ONLY brand colour. Green / amber / red are reserved for the
      safety classification and must never be used decoratively — in this
      product colour is data.

   2. Every colour used for text clears WCAG AA (4.5:1) on white. The previous
      values did not: restricted #F59E0B measured 2.15:1, safe #16A34A 3.30:1,
      and textMuted #94A3B8 2.56:1.
   ========================================================================= */

export const Colors = {
  // -- Brand ---------------------------------------------------------------
  primary: '#1B4D8E',        // 8.40:1 on white
  primaryLight: '#2E6ABF',
  primaryDark: '#143A6B',
  primaryDeep: '#0F2E52',    // mastheads, auth panel
  primaryTint: '#E8F1FC',    // fills only, never text
  primaryTintSoft: '#F4F8FD',
  primaryBorder: '#C9DEF7',

  // -- Neutrals ------------------------------------------------------------
  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceSoft: '#F8FAFC',
  text: '#0F172A',           // 17.85:1
  textSecondary: '#475569',  //  7.44:1
  textMuted: '#64748B',      //  4.76:1  (was #94A3B8 at 2.56:1 — failed AA)
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  // -- Safety classification (reserved) ------------------------------------
  safe: '#15803D',           // 5.02:1  (was #16A34A at 3.30:1)
  safeBg: '#F0FDF4',
  safeBorder: '#BBF7D0',
  restricted: '#B45309',     // 5.02:1  (was #F59E0B at 2.15:1)
  restrictedBg: '#FFFBEB',
  restrictedBorder: '#FDE68A',
  unsafe: '#B91C1C',         // 6.47:1
  unsafeBg: '#FEF2F2',
  unsafeBorder: '#FECACA',

  // -- Feedback ------------------------------------------------------------
  success: '#15803D',
  successBg: '#F0FDF4',
  warning: '#B45309',
  warningBg: '#FFFBEB',
  error: '#B91C1C',
  errorBg: '#FEF2F2',
  info: '#1B4D8E',
  infoBg: '#E8F1FC',
  infoBorder: '#C9DEF7',

  // -- Sync / outbox status ------------------------------------------------
  // Distinct from the safety palette on purpose: sync state is workflow
  // metadata, not a life-safety signal, so it must not borrow those colours.
  statusPendingSync: '#475569',
  statusSyncing: '#1B4D8E',
  statusFailed: '#B91C1C',
  statusPendingReview: '#B45309',
  statusReviewed: '#15803D',
  statusReportGenerated: '#1B4D8E',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  ms: 12,   // added: wizardTheme had no 12, forcing ad-hoc values
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xxs: 11,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const Typography = {
  fontFamily: {
    body: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
} as const;

export const BorderRadius = {
  control: 6,   // buttons, inputs
  card: 8,      // cards, panels
  overlay: 10,  // modals, sheets
  full: 9999,   // avatars and status dots only
  // Legacy aliases kept so existing screens keep compiling during migration.
  sm: 6,
  md: 8,
  lg: 10,
  xl: 10,
} as const;

/** WCAG 2.2 AA requires 24x24; 48 is the comfortable field-use target. */
export const MinTouchTarget = 48;

export const Elevation = {
  raised: platformShadow('#0F172A', { width: 0, height: 1 }, 0.08, 3, 2),
  overlay: platformShadow('#0F172A', { width: 0, height: 6 }, 0.12, 16, 8),
} as const;

/* ----------------------------------------------------------------------------
   Migration shim.

   constants/wizardTheme.ts re-exports this object so the three wizard screens
   keep working while they are migrated to the tokens above. It is a view onto
   the same values — not a second palette — so the two can no longer diverge.
   ------------------------------------------------------------------------- */
export const WizardTheme = {
  colors: {
    primary: Colors.primary,
    primaryPressed: Colors.primaryDark,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    textMuted: Colors.textMuted,
    border: Colors.border,
    pending: Colors.textMuted,
    success: Colors.safe,
    restricted: Colors.restricted,
    unsafe: Colors.unsafe,
    infoBg: Colors.infoBg,
    infoBorder: Colors.infoBorder,
    infoText: Colors.primaryDark,
  },
  radius: {
    sm: BorderRadius.control,
    md: BorderRadius.card,
    lg: BorderRadius.overlay,
    pill: BorderRadius.full,
  },
  spacing: {
    sm: Spacing.sm,
    md: Spacing.md,
    lg: Spacing.lg,
  },
  typography: {
    fontFamily: Typography.fontFamily,
    label: FontSize.md,
    body: FontSize.sm,
    helper: FontSize.xs,
  },
  elevation: { ...Elevation.raised },
} as const;
