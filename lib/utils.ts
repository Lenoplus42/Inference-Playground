// Compute the P-th percentile (0–100) of a sorted or unsorted array.
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(((p / 100) * (sorted.length - 1)));
  return sorted[Math.max(0, idx)];
}

// Format a number with commas
export function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

// Format bytes as human-readable GB / MB
export function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${bytes} B`;
}

// Format a tick-based latency value
export function fmtTicks(ticks: number): string {
  if (ticks === 0 || !isFinite(ticks)) return '—';
  return ticks.toFixed(1) + ' t';
}

// Clamp a value to [min, max]
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
