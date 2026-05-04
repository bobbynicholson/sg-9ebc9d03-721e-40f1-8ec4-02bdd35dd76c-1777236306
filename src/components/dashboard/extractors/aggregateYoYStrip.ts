/**
 * Tier 1 chart 2 -- Year-over-year comparison strip.
 *
 * Returns 4 metrics with current/prior totals, delta %, and a 12-bucket
 * sparkline trail. Inputs:
 *   - orders for the last ~24 months (split by event_date)
 *   - quotes for the last ~24 months (for conversion rate)
 *   - leads for the last ~24 months (for conversion rate)
 *
 * Buckets are MONTHS, not days, so the sparkline reads as a year-shape
 * regardless of the date-range picker (this strip is a constant fixture).
 *
 * Pure function: takes raw rows + a "current period" window, returns
 * the strip's data shape. The page wraps a date range around it.
 */
import type { RevenueByMonthInput } from "./aggregateRevenueByMonth";

export interface QuoteForYoY {
  id: string;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
  accepted_at: string | null;
  event_date?: string | null;
}

export interface LeadForYoY {
  id: string;
  status: string | null;
  created_at: string | null;
}

export interface YoYStripMetric {
  label: string;
  current: number;
  prior: number;
  /** Signed delta % (current vs prior). null when prior was 0. */
  deltaPct: number | null;
  /** 12 monthly trailing values, oldest first. Drives the sparkline. */
  sparkline: number[];
  /** Pre-formatted current value for direct render (R / count / %). */
  display: string;
  /** "currency" | "count" | "percent" -- consumers can re-format if needed. */
  format: "currency" | "count" | "percent";
}

export interface YoYStripResult {
  revenue: YoYStripMetric;
  orderCount: YoYStripMetric;
  avgOrderValue: YoYStripMetric;
  conversionRate: YoYStripMetric;
}

const MONTH_KEY = (d: Date | string): string => {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

const monthKeyFromDateString = (s: string | null | undefined): string => {
  // event_date is "YYYY-MM-DD"; created_at is ISO timestamp. Both yield
  // the right month after slicing.
  if (!s) return "";
  return s.length >= 7 ? s.slice(0, 7) : "";
};

const isBookedOrder = (o: RevenueByMonthInput): boolean =>
  !!o.status && o.status !== "cancelled";

const collectedFromOrder = (o: RevenueByMonthInput): number => {
  if (typeof o.amount_paid === "number" && o.amount_paid > 0) return o.amount_paid;
  let sum = 0;
  if (o.deposit_paid && typeof o.deposit_amount === "number") sum += o.deposit_amount;
  if (o.balance_paid && typeof o.balance_amount === "number") sum += o.balance_amount;
  if (sum > 0) return sum;
  if (o.payment_status === "paid" && typeof o.total_amount === "number") return o.total_amount;
  return 0;
};

const fmtR = (n: number): string =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);
const fmtCount = (n: number): string => Math.round(n).toLocaleString("en-ZA");
const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

const deltaPct = (current: number, prior: number): number | null => {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
};

/**
 * Build the strip.
 *
 * @param orders   orders covering the last 24 months (event_date)
 * @param quotes   quotes covering the last 24 months (created_at)
 * @param leads    leads covering the last 24 months (created_at)
 * @param now      anchor for "today" -- defaults to new Date(). Used to
 *                 split current vs prior periods. Tests pass a fixed date.
 */
export function aggregateYoYStrip(
  orders: RevenueByMonthInput[],
  quotes: QuoteForYoY[],
  leads: LeadForYoY[],
  now: Date = new Date(),
): YoYStripResult {
  // Current period = trailing 12 months ending at end of the current month.
  // Prior period = the 12 months before that (24..12 months ago).
  // Sparkline = 12 monthly points covering the CURRENT period only.
  const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of current month
  const currentStart = new Date(currentEnd);
  currentStart.setMonth(currentStart.getMonth() - 11);
  currentStart.setDate(1);
  currentStart.setHours(0, 0, 0, 0);

  const priorEnd = new Date(currentStart);
  priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setMonth(priorStart.getMonth() - 11);
  priorStart.setDate(1);
  priorStart.setHours(0, 0, 0, 0);

  const inWindow = (s: string | null | undefined, start: Date, end: Date): boolean => {
    if (!s) return false;
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return false;
    return dt >= start && dt <= end;
  };

  // Pre-build sparkline skeleton (12 month keys).
  const sparkSkeleton: { key: string; idx: number }[] = [];
  const cursor = new Date(currentStart);
  for (let i = 0; i < 12; i++) {
    sparkSkeleton.push({ key: MONTH_KEY(cursor), idx: i });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const sparkIdxByKey = new Map(sparkSkeleton.map((s) => [s.key, s.idx]));

  // ── Revenue (booked) + order count ──────────────────────────────
  let revCurrent = 0, revPrior = 0;
  let countCurrent = 0, countPrior = 0;
  const revSpark = new Array(12).fill(0) as number[];
  const countSpark = new Array(12).fill(0) as number[];

  for (const o of orders) {
    if (!isBookedOrder(o)) continue;
    if (!o.event_date) continue;
    const eventDate = new Date(o.event_date);
    if (isNaN(eventDate.getTime())) continue;
    const total = Number(o.total_amount || 0);
    if (eventDate >= currentStart && eventDate <= currentEnd) {
      revCurrent += total;
      countCurrent += 1;
      const idx = sparkIdxByKey.get(monthKeyFromDateString(o.event_date));
      if (idx !== undefined) {
        revSpark[idx] += total;
        countSpark[idx] += 1;
      }
    } else if (eventDate >= priorStart && eventDate <= priorEnd) {
      revPrior += total;
      countPrior += 1;
    }
  }

  // ── Avg order value ─────────────────────────────────────────────
  const aovCurrent = countCurrent > 0 ? revCurrent / countCurrent : 0;
  const aovPrior = countPrior > 0 ? revPrior / countPrior : 0;
  const aovSpark = revSpark.map((r, i) => (countSpark[i] > 0 ? r / countSpark[i] : 0));

  // ── Conversion rate -- accepted quotes / leads, both keyed by created_at ─
  let leadsCurrent = 0, leadsPrior = 0;
  const leadsSpark = new Array(12).fill(0) as number[];
  for (const l of leads) {
    if (inWindow(l.created_at, currentStart, currentEnd)) {
      leadsCurrent += 1;
      const idx = sparkIdxByKey.get(monthKeyFromDateString(l.created_at));
      if (idx !== undefined) leadsSpark[idx] += 1;
    } else if (inWindow(l.created_at, priorStart, priorEnd)) {
      leadsPrior += 1;
    }
  }

  let acceptedCurrent = 0, acceptedPrior = 0;
  const acceptedSpark = new Array(12).fill(0) as number[];
  for (const q of quotes) {
    if (q.status !== "accepted") continue;
    if (inWindow(q.accepted_at, currentStart, currentEnd)) {
      acceptedCurrent += 1;
      const idx = sparkIdxByKey.get(monthKeyFromDateString(q.accepted_at));
      if (idx !== undefined) acceptedSpark[idx] += 1;
    } else if (inWindow(q.accepted_at, priorStart, priorEnd)) {
      acceptedPrior += 1;
    }
  }

  const convCurrent = leadsCurrent > 0 ? (acceptedCurrent / leadsCurrent) * 100 : 0;
  const convPrior = leadsPrior > 0 ? (acceptedPrior / leadsPrior) * 100 : 0;
  const convSpark = leadsSpark.map((leadCount, i) =>
    leadCount > 0 ? (acceptedSpark[i] / leadCount) * 100 : 0,
  );

  return {
    revenue: {
      label: "Booked revenue",
      current: revCurrent,
      prior: revPrior,
      deltaPct: deltaPct(revCurrent, revPrior),
      sparkline: revSpark,
      display: fmtR(revCurrent),
      format: "currency",
    },
    orderCount: {
      label: "Confirmed orders",
      current: countCurrent,
      prior: countPrior,
      deltaPct: deltaPct(countCurrent, countPrior),
      sparkline: countSpark,
      display: fmtCount(countCurrent),
      format: "count",
    },
    avgOrderValue: {
      label: "Avg order value",
      current: aovCurrent,
      prior: aovPrior,
      deltaPct: deltaPct(aovCurrent, aovPrior),
      sparkline: aovSpark,
      display: fmtR(aovCurrent),
      format: "currency",
    },
    conversionRate: {
      label: "Lead conversion",
      current: convCurrent,
      prior: convPrior,
      deltaPct: deltaPct(convCurrent, convPrior),
      sparkline: convSpark,
      display: fmtPct(convCurrent),
      format: "percent",
    },
  };
}
