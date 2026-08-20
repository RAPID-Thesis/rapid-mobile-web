/**
 * Compatibility re-export.
 *
 * This file used to define a second, independent design system whose values
 * disagreed with constants/theme.ts on the primary blue, the background, every
 * radius, and the safety colours. Both were live on adjacent screens.
 *
 * `WizardTheme` is now a view onto the unified tokens in constants/theme.ts, so
 * the two can no longer drift. New code should import from constants/theme.ts
 * directly; this shim exists so the wizard screens keep working while they are
 * migrated.
 */
export { WizardTheme } from './theme';
