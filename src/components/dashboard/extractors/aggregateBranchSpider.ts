/**
 * Tier 6 chart 1 - Branch comparison spider/radar.
 *
 * For each branch (region) we compute a set of metrics across the same
 * 24-month window the rest of the BI section uses, then NORMALISE each
 * metric to 0..100 across the set of branches. The polygon shape on
 * the radar shows where each branch is strong vs weak relative to its
 * peers - not absolute values.
 *
 * Axes (all directional - higher = better):
 *   1. Revenue
 *   2. Order volume
 *   3. Win rate (won leads / total leads with status)
 *   4. AOV (avg order value across non-cancelled orders)
 *   5. Speed (inverse of median quote-to-accept hours; faster = higher)
 *   6. Reliability (inverse of cancellation rate; fewer cancels = higher)
 *
 * Pure function: takes orders + quotes + leads + the set of known
 * branches, returns a shape consumable directly by Recharts' RadarChart.
 */

import type { RevenueByMonthInput } from "./aggregateRevenueByMonth";
import type { QuoteForYoY, LeadForYoY } from "./aggregateYoYStrip";
import type { CancelledOrder } from "./aggregateCancellationReasons";

export interface BranchOption {
  id: string;
  name: string;
}

export interface BranchSpiderRow {
  /** axis label (short) */
  axis: string;
  /** longer description for the tooltip */
  description: string;
  /** Per-branch normalised score 0..100, keyed by branch id */
  [branchId: string]: number | string;
}

export interface BranchSeries {
  id: string;
  name: string;
  /** Hex colour for the polygon */
  colour: string;
}

export interface BranchSpiderResult {
  axes: BranchSpiderRow[];
  series: BranchSeries[];
  /** Raw (un-normalised) numbers per branch per axis. Used for the
   *  tooltip + the legend strip beneath the chart. */
  rawByBranch: Record<string, {
    revenue: number;
    orderCount: number;
    winRate: number;        // 0..1
    aov: number;
    medianAcceptHours: number; // NaN when not enough samples
    cancellationRate: number; // 0..1
  }>;
  isEmpty: boolean;
}

const AXIS_DEFS = [
  { key: "revenue",     axis: "Revenue",      description: "Total realised revenue from non-cancelled orders." },
  { key: "orders",      axis: "Volume",       description: "Number of non-cancelled orders booked." },
  { key: "winRate",     axis: "Win rate",     description: "Won leads as a share of leads that reached a decision." },
  { key: "aov",         axis: "AOV",          description: "Average order value across non-cancelled orders." },
  { key: "speed",       axis: "Speed",        description: "How fast quotes get accepted - inverse of median time-to-accept." },
  { key: "reliability", axis: "Reliability",  description: "Inverse of cancellation rate - higher means fewer orders cancelled." },
] as const;

const PALETTE = [
  "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f43f5e", "#6366f1",
];

const HOUR_MS = 60 * 60 * 1000;

const median = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
};

const normalise = (values: number[]): number[] => {
  // Map raw values to 0..100 using max as 100. Negative values get
  // clamped to 0 (shouldn't happen with our metrics).
  let max = 0;
  for (const v of values) if (isFinite(v) && v > max) max = v;
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => (isFinite(v) && v > 0 ? Math.min(100, (v / max) * 100) : 0));
};

export function aggregateBranchSpider(
  branches: BranchOption[],
  orders: RevenueByMonthInput[],
  quotes: QuoteForYoY[],
  leads: LeadForYoY[],
): BranchSpiderResult {
  if (branches.length === 0) {
    return { axes: [], series: [], rawByBranch: {}, isEmpty: true };
  }

  // Per-branch raw aggregations.
  const raw = new Map<string, {
    revenue: number;
    orderCount: number;
    cancelledCount: number;
    totalOrders: number;
    aovSum: number;
    aovN: number;
    decisivLeads: number; // won + lost only
    wonLeads: number;
    acceptHours: number[];
  }>();
  for (const b of branches) {
    raw.set(b.id, {
      revenue: 0, orderCount: 0, cancelledCount: 0, totalOrders: 0,
      aovSum: 0, aovN: 0, decisivLeads: 0, wonLeads: 0, acceptHours: [],
    });
  }

  // Orders -> revenue, AOV, order volume, cancellation.
  for (const o of orders as CancelledOrder[]) {
    const rid = o.region_id;
    if (!rid || !raw.has(rid)) continue;
    const agg = raw.get(rid)!;
    agg.totalOrders += 1;
    const isCancelled = o.status === "cancelled" || !!o.cancelled_at;
    if (isCancelled) {
      agg.cancelledCount += 1;
      continue;
    }
    const amount = Number(o.total_amount) || 0;
    agg.revenue += amount;
    agg.orderCount += 1;
    if (amount > 0) {
      agg.aovSum += amount;
      agg.aovN += 1;
    }
  }

  // Leads -> win rate.
  for (const l of leads) {
    const rid = l.region_id;
    if (!rid || !raw.has(rid)) continue;
    const agg = raw.get(rid)!;
    if (l.status === "won" || l.status === "converted") {
      agg.decisivLeads += 1;
      agg.wonLeads += 1;
    } else if (l.status === "lost") {
      agg.decisivLeads += 1;
    }
  }

  // Quotes -> response speed.
  for (const q of quotes) {
    const rid = q.region_id;
    if (!rid || !raw.has(rid)) continue;
    // TIGHTEN I.61: include converted-but-not-status='accepted' quotes
    // so branch accept-time metrics don't undercount.
    if (q.status !== "accepted" && !(q as any).converted_to_order_id) continue;
    if (!q.sent_at || !q.accepted_at) continue;
    const sent = new Date(q.sent_at).getTime();
    const acc = new Date(q.accepted_at).getTime();
    if (!isFinite(sent) || !isFinite(acc)) continue;
    const diff = acc - sent;
    if (diff < 0) continue;
    raw.get(rid)!.acceptHours.push(diff / HOUR_MS);
  }

  // Compute per-branch metrics.
  const rawByBranch: BranchSpiderResult["rawByBranch"] = {};
  for (const b of branches) {
    const a = raw.get(b.id)!;
    const aov = a.aovN > 0 ? a.aovSum / a.aovN : 0;
    const winRate = a.decisivLeads > 0 ? a.wonLeads / a.decisivLeads : 0;
    const cancellationRate = a.totalOrders > 0 ? a.cancelledCount / a.totalOrders : 0;
    const medAccept = median(a.acceptHours);
    rawByBranch[b.id] = {
      revenue: a.revenue,
      orderCount: a.orderCount,
      winRate,
      aov,
      medianAcceptHours: medAccept,
      cancellationRate,
    };
  }

  // For "speed" we invert hours. To produce a comparable raw value we
  // use 1 / max(medianHours, 0.5). Branches with no accept samples score 0.
  const speedRaw = branches.map((b) => {
    const m = rawByBranch[b.id].medianAcceptHours;
    if (!isFinite(m) || m <= 0) return 0;
    return 1 / Math.max(m, 0.5);
  });
  // For "reliability" we use (1 - cancellationRate). Empty totalOrders
  // collapses to 0 (no signal).
  const reliabilityRaw = branches.map((b) => {
    const a = raw.get(b.id)!;
    if (a.totalOrders === 0) return 0;
    return 1 - rawByBranch[b.id].cancellationRate;
  });

  const revRaw = branches.map((b) => rawByBranch[b.id].revenue);
  const ordRaw = branches.map((b) => rawByBranch[b.id].orderCount);
  const winRaw = branches.map((b) => rawByBranch[b.id].winRate);
  const aovRaw = branches.map((b) => rawByBranch[b.id].aov);

  const revN = normalise(revRaw);
  const ordN = normalise(ordRaw);
  const winN = normalise(winRaw);
  const aovN = normalise(aovRaw);
  const speedN = normalise(speedRaw);
  const relN = normalise(reliabilityRaw);

  const axisVals: Record<string, number[]> = {
    revenue: revN, orders: ordN, winRate: winN, aov: aovN, speed: speedN, reliability: relN,
  };

  const axes: BranchSpiderRow[] = AXIS_DEFS.map((d) => {
    const row: BranchSpiderRow = { axis: d.axis, description: d.description };
    branches.forEach((b, i) => { row[b.id] = axisVals[d.key][i]; });
    return row;
  });

  const series: BranchSeries[] = branches.map((b, i) => ({
    id: b.id,
    name: b.name,
    colour: PALETTE[i % PALETTE.length],
  }));

  // Empty when every raw metric is 0 across every branch - means we
  // have branches set up but no operational data yet.
  const totalActivity = revRaw.reduce((s, v) => s + v, 0)
    + ordRaw.reduce((s, v) => s + v, 0);
  const isEmpty = totalActivity === 0;

  return { axes, series, rawByBranch, isEmpty };
}
