import { toLocalISO } from "@/lib/localDate";
/**
 * Tier 2 chart 2 -- Capacity load calendar (next 90 days).
 *
 * Day-by-day stacked bar:
 *   - Confirmed orders (solid)
 *   - Open quotes still in play (semi-transparent on top)
 *
 * The chart can highlight days that breach the over-capacity line
 * (default 3 events/day; tenants override via setting later).
 *
 * Pure function: takes orders + quotes already filtered to status,
 * returns 90 daily buckets (oldest first = today).
 */
export interface CapacityOrderInput {
  status: string | null;
  event_date: string | null;
}

export interface CapacityQuoteInput {
  status: string | null;
  event_date: string | null;
}

export interface CapacityDayBucket {
  /** "YYYY-MM-DD" -- safe sortable key */
  isoDate: string;
  /** Short label "Sat 14 May" for the x-axis */
  label: string;
  confirmedOrders: number;
  openQuotes: number;
  /** True when (confirmedOrders + openQuotes) >= capacityCeiling. */
  overCapacity: boolean;
}

export interface CapacityLoadResult {
  days: CapacityDayBucket[];
  /** Headline numbers. */
  totalConfirmed: number;
  totalOpenQuotes: number;
  daysOverCapacity: number;
}

const ACTIVE_ORDER_STATUSES = new Set([
  "confirmed", "preparing", "ready", "in_transit",
]);
const OPEN_QUOTE_STATUSES = new Set(["sent", "viewed", "revised"]);

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const fmtLabel = (d: Date): string =>
  `${SHORT_DAY[d.getDay()]} ${d.getDate()} ${SHORT_MONTH[d.getMonth()]}`;

export function aggregateCapacityLoad(
  orders: CapacityOrderInput[],
  quotes: CapacityQuoteInput[],
  capacityCeiling: number = 3,
  startAt: Date = new Date(),
  daysAhead: number = 90,
): CapacityLoadResult {
  const start = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
  start.setHours(0, 0, 0, 0);

  // Pre-build the empty 90-day skeleton.
  const buckets = new Map<string, CapacityDayBucket>();
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const iso = toLocalISO(d);
    buckets.set(iso, {
      isoDate: iso,
      label: fmtLabel(d),
      confirmedOrders: 0,
      openQuotes: 0,
      overCapacity: false,
    });
  }

  let totalConfirmed = 0;
  for (const o of orders) {
    if (!o.event_date) continue;
    if (!o.status || !ACTIVE_ORDER_STATUSES.has(o.status)) continue;
    const iso = String(o.event_date).slice(0, 10);
    const bucket = buckets.get(iso);
    if (!bucket) continue;
    bucket.confirmedOrders += 1;
    totalConfirmed += 1;
  }

  let totalOpenQuotes = 0;
  for (const q of quotes) {
    if (!q.event_date) continue;
    if (!q.status || !OPEN_QUOTE_STATUSES.has(q.status)) continue;
    const iso = String(q.event_date).slice(0, 10);
    const bucket = buckets.get(iso);
    if (!bucket) continue;
    bucket.openQuotes += 1;
    totalOpenQuotes += 1;
  }

  // Mark over-capacity days.
  let daysOverCapacity = 0;
  for (const bucket of buckets.values()) {
    if (bucket.confirmedOrders + bucket.openQuotes >= capacityCeiling) {
      bucket.overCapacity = true;
      daysOverCapacity += 1;
    }
  }

  return {
    days: Array.from(buckets.values()),
    totalConfirmed,
    totalOpenQuotes,
    daysOverCapacity,
  };
}