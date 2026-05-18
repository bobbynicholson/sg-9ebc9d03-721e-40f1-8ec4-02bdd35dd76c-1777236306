/**
 * Tier 4 chart 2 - Quote-to-accept time distribution.
 *
 * Histogram of (accepted_at - sent_at) bucketed into:
 *   <2h, 2-24h, 1-3d, 3-7d, 7-14d, 14d+
 *
 * Returns counts per bucket plus median + 90th-percentile for the
 * chart's annotations. Pure function: takes accepted quotes only.
 */
import type { QuoteForYoY } from "./aggregateYoYStrip";

export interface AcceptTimeBucket {
  /** Sortable index 0..5 so the chart renders in the right order. */
  idx: number;
  /** Short bucket label for the x-axis. */
  label: string;
  /** Tooltip-friendly long form. */
  longLabel: string;
  count: number;
  /** Inclusive lower bound in hours. */
  fromHours: number;
  /** Exclusive upper bound in hours; null = open-ended. */
  toHours: number | null;
}

export interface QuoteAcceptTimeResult {
  buckets: AcceptTimeBucket[];
  /** Total quotes counted (denominator). */
  total: number;
  /** Median hours-to-accept across all counted quotes. NaN when total=0. */
  medianHours: number;
  /** 90th percentile hours-to-accept. NaN when total=0. */
  p90Hours: number;
  /** Quickest accept (in hours) seen in the dataset. NaN when total=0. */
  fastestHours: number;
}

const BUCKETS: ReadonlyArray<Omit<AcceptTimeBucket, "count">> = [
  { idx: 0, label: "<2h",    longLabel: "Less than 2 hours",    fromHours: 0,    toHours: 2 },
  { idx: 1, label: "2-24h",  longLabel: "2 to 24 hours",         fromHours: 2,    toHours: 24 },
  { idx: 2, label: "1-3d",   longLabel: "1 to 3 days",           fromHours: 24,   toHours: 72 },
  { idx: 3, label: "3-7d",   longLabel: "3 to 7 days",           fromHours: 72,   toHours: 168 },
  { idx: 4, label: "7-14d",  longLabel: "7 to 14 days",          fromHours: 168,  toHours: 336 },
  { idx: 5, label: "14d+",   longLabel: "More than 14 days",     fromHours: 336,  toHours: null },
];

const HOUR_MS = 60 * 60 * 1000;

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
};

export function aggregateQuoteAcceptTime(quotes: QuoteForYoY[]): QuoteAcceptTimeResult {
  // Collect hours-to-accept for every quote that actually reached
  // accepted (status='accepted' AND has both timestamps).
  const samples: number[] = [];
  for (const q of quotes) {
    if (q.status !== "accepted") continue;
    const acceptedAt = q.accepted_at ? new Date(q.accepted_at) : null;
    const sentAt = q.sent_at ? new Date(q.sent_at) : null;
    if (!acceptedAt || !sentAt) continue;
    if (isNaN(acceptedAt.getTime()) || isNaN(sentAt.getTime())) continue;
    const diffMs = acceptedAt.getTime() - sentAt.getTime();
    if (diffMs < 0) continue; // accepted-before-sent? skip the data error
    samples.push(diffMs / HOUR_MS);
  }

  // Build buckets.
  const buckets: AcceptTimeBucket[] = BUCKETS.map((b) => ({ ...b, count: 0 }));
  for (const hours of samples) {
    for (const b of buckets) {
      const inLower = hours >= b.fromHours;
      const inUpper = b.toHours === null ? true : hours < b.toHours;
      if (inLower && inUpper) {
        b.count += 1;
        break;
      }
    }
  }

  // Stats.
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.length;
  const medianHours = total > 0 ? percentile(sorted, 50) : NaN;
  const p90Hours = total > 0 ? percentile(sorted, 90) : NaN;
  const fastestHours = total > 0 ? sorted[0] : NaN;

  return { buckets, total, medianHours, p90Hours, fastestHours };
}
