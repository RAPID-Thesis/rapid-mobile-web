/**
 * Join conditional class names.
 *
 * Deliberately tiny — `clsx`/`tailwind-merge` would be two more dependencies for
 * something this project uses in one direction only (compose, never override).
 * Components below expose `className` last so callers can still win specificity.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
