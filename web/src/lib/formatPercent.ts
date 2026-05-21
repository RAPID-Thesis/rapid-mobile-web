/** Format a 0–1 ratio as a human-readable percentage string. */
export function formatPercent(value: number | string | null | undefined, decimals = 1): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  const pct = n <= 1 && n >= 0 ? n * 100 : n;
  return `${pct.toFixed(decimals)}%`;
}

/** Normalize a stored ratio (0–1) for progress-bar width (0–100). */
export function ratioToPercentWidth(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const pct = n <= 1 && n >= 0 ? n * 100 : n;
  return Math.min(100, Math.max(0, pct));
}
