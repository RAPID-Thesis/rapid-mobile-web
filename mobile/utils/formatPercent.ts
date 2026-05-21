/** Format a 0–1 ratio as a human-readable percentage string. */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value <= 1 && value >= 0 ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}
