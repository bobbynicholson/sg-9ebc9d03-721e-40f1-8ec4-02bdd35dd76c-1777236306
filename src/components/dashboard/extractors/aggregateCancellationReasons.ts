/**
 * Tier 5 chart 1 -- Cancellation reasons.
 *
 * Looks at orders that were cancelled (status='cancelled' OR cancelled_at
 * set) within the input set, groups by a normalised version of
 * cancellation_reason, and ranks reasons by revenue lost (sum of
 * total_amount). Top 6 are kept; the rest roll into "Other".
 *
 * Pure function: takes the orders array already loaded by the BI
 * wrapper, no separate fetch needed.
 */
import type { RevenueByMonthInput } from "./aggregateRevenueByMonth";

export interface CancelledOrder extends RevenueByMonthInput {
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

export interface CancellationReasonRow {
  /** Display label (already title-cased, "Other" for the bucket). */
  label: string;
  /** Original key so colour mapping is stable across renders. */
  key: string;
  count: number;
  /** Sum of total_amount for orders cancelled with this reason. */
  revenueLost: number;
  /** Share of total cancelled revenue (0..1). */
  share: number;
}

export interface CancellationReasonsResult {
  rows: CancellationReasonRow[];
  totalCancelled: number;
  totalRevenueLost: number;
  /** Cancellation rate vs. all non-deleted orders in the input set. */
  cancellationRate: number;
}

const TOP_N = 6;

const normaliseReason = (raw: string | null | undefined): { key: string; label: string } => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { key: "_unspecified", label: "Unspecified" };
  // Lowercase + strip trailing punctuation for grouping.
  const key = trimmed.toLowerCase().replace(/[.!?,:;]+$/g, "");
  // Keep label in original case but clip to a sensible chart length.
  const label = trimmed.length > 40 ? `${trimmed.slice(0, 38)}...` : trimmed;
  return { key, label };
};

export function aggregateCancellationReasons(orders: CancelledOrder[]): CancellationReasonsResult {
  let totalCancelled = 0;
  let totalRevenueLost = 0;
  const byKey = new Map<string, { label: string; count: number; revenueLost: number }>();

  for (const o of orders) {
    const isCancelled = o.status === "cancelled" || !!o.cancelled_at;
    if (!isCancelled) continue;
    totalCancelled += 1;
    const amount = Number(o.total_amount) || 0;
    totalRevenueLost += amount;

    const { key, label } = normaliseReason(o.cancellation_reason);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.revenueLost += amount;
    } else {
      byKey.set(key, { label, count: 1, revenueLost: amount });
    }
  }

  // Rank reasons by revenue lost desc, then by count.
  const ranked = Array.from(byKey.entries())
    .map(([key, v]) => ({ key, label: v.label, count: v.count, revenueLost: v.revenueLost }))
    .sort((a, b) => {
      if (b.revenueLost !== a.revenueLost) return b.revenueLost - a.revenueLost;
      return b.count - a.count;
    });

  const top = ranked.slice(0, TOP_N);
  const tail = ranked.slice(TOP_N);
  const rows: CancellationReasonRow[] = top.map((r) => ({
    key: r.key,
    label: r.label,
    count: r.count,
    revenueLost: r.revenueLost,
    share: totalRevenueLost > 0 ? r.revenueLost / totalRevenueLost : 0,
  }));
  if (tail.length > 0) {
    const otherCount = tail.reduce((s, r) => s + r.count, 0);
    const otherRev = tail.reduce((s, r) => s + r.revenueLost, 0);
    rows.push({
      key: "_other",
      label: `Other (${tail.length})`,
      count: otherCount,
      revenueLost: otherRev,
      share: totalRevenueLost > 0 ? otherRev / totalRevenueLost : 0,
    });
  }

  // Cancellation rate denominator = all orders we have a window of, not
  // just cancelled ones (so the user sees "5% of orders got cancelled").
  const cancellationRate = orders.length > 0 ? totalCancelled / orders.length : 0;

  return { rows, totalCancelled, totalRevenueLost, cancellationRate };
}
