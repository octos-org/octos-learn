export interface HandwritingLatencySummary {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
}

export function percentile(values: readonly number[], ratio: number): number {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((ratio / 100) * sorted.length) - 1));
  return sorted[index]!;
}

export function summarizeLatency(values: readonly number[]): HandwritingLatencySummary {
  const valid = values.filter(Number.isFinite);
  return {
    count: valid.length,
    min: valid.length ? Math.min(...valid) : Number.NaN,
    p50: percentile(valid, 50),
    p95: percentile(valid, 95),
    max: valid.length ? Math.max(...valid) : Number.NaN,
  };
}

export function formatLatency(summary: HandwritingLatencySummary): string {
  if (!summary.count) return "—";
  return `p50 ${summary.p50.toFixed(1)} ms · p95 ${summary.p95.toFixed(1)} ms`;
}
