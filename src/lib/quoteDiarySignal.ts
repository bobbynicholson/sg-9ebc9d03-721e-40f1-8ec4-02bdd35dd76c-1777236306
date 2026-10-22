/**
 * Quote diary signal - "do we have a gap on this date?"
 *
 * The Quote Management page lifts orders + unconverted accepted quotes
 * from the same company and pivots them by event_date. For each open
 * quote the team sees an at-a-glance signal:
 *
 *   - Wide open       - nothing booked the whole week (push hard)
 *   - Quiet day       - nothing same-day, 1-2 nearby (good fit)
 *   - One booking     - one event the same day (still doable)
 *   - Multiple bookings - a diary count, not an over-capacity warning
 *
 * The "Wide open" and "Quiet day" buckets are the cue Bobby asked for
 * - those are the days we'd want to offer a treat or discount to lock
 * in revenue we'd otherwise leave on the floor.
 */
export type DiaryStatus = "wide_open" | "quiet" | "one_booking" | "stacked" | "unknown";

export interface DiaryEntry {
  /** ISO date (YYYY-MM-DD) of the booked event. */
  date: string;
  /** What kind of commitment - order or accepted quote. */
  kind: "order" | "accepted_quote";
  /** Display label, e.g. "Naidoo Family". */
  label: string;
  /** Optional guest count. */
  guests?: number | null;
  /** Stable source row id, used to deduplicate repeated query results. */
  sourceId?: string | null;
  /** The originating quote, including when this entry is its order. */
  quoteId?: string | null;
}

export interface DiarySignal {
  status: DiaryStatus;
  /** Same-day commitments, counting each order/accepted quote pair once. */
  sameDay: DiaryEntry[];
  /** ±2 day window, excluding same-day. */
  nearby: DiaryEntry[];
  /** True when the team should consider a sweetener to close the deal. */
  sweetenerWorthwhile: boolean;
  /** Plain-English headline for rendering. */
  headline: string;
  /** Short follow-on for the muted line below the headline. */
  detail: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Normalise a date-ish value to YYYY-MM-DD in the local timezone.
 * The orders + quotes tables both store event_date as a date column,
 * so we don't want to drift days through UTC conversion.
 */
export function toDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  // Postgres DATE values are calendar dates, not UTC instants. Parsing
  // them as UTC shifts them to the previous day in western timezones.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const calendar = new Date(year, month - 1, day, 12);
    return calendar.getFullYear() === year && calendar.getMonth() === month - 1 && calendar.getDate() === day
      ? value : null;
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;
  // YYYY-MM-DD using local components - matches what's stored in
  // postgres date columns when the team enters dates in their tz.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export interface DiaryOrderRow {
  id: string;
  quote_id?: string | null;
  event_date: string | null;
  client_name?: string | null;
  guest_count?: number | null;
  status?: string | null;
  deleted_at?: string | null;
}

export interface DiaryQuoteRow extends Omit<DiaryOrderRow, "quote_id"> {
  converted_to_order_id?: string | null;
}

/** One commercial booking per entry. Orders own their date and lifecycle;
 *  an accepted quote only reserves a slot until an order exists. */
export function buildDiaryEntries(orders: DiaryOrderRow[], quotes: DiaryQuoteRow[]): DiaryEntry[] {
  const linkedQuotes = new Set(orders.map((order) => order.quote_id).filter(Boolean));
  const entries: DiaryEntry[] = [];
  for (const order of orders) {
    const date = toDateKey(order.event_date);
    if (!date || order.deleted_at || ["cancelled", "canceled", "draft"].includes((order.status || "").toLowerCase())) continue;
    entries.push({ date, kind: "order", sourceId: order.id, quoteId: order.quote_id, label: order.client_name || "Order", guests: order.guest_count });
  }
  for (const quote of quotes) {
    if (quote.deleted_at || quote.status !== "accepted" || quote.converted_to_order_id || linkedQuotes.has(quote.id)) continue;
    const date = toDateKey(quote.event_date);
    if (date) entries.push({ date, kind: "accepted_quote", sourceId: quote.id, quoteId: quote.id, label: quote.client_name || "Accepted quote", guests: quote.guest_count });
  }
  return entries;
}

/**
 * Build a Map keyed by YYYY-MM-DD for fast same-day + nearby lookup.
 * Caller passes the raw rows from orders + accepted quotes.
 */
export function buildDiaryIndex(entries: DiaryEntry[]): Map<string, DiaryEntry[]> {
  const idx = new Map<string, DiaryEntry[]>();
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.date) continue;
    const identity = e.sourceId ? `${e.kind}:${e.sourceId}` : null;
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    const list = idx.get(e.date) || [];
    list.push(e);
    idx.set(e.date, list);
  }
  return idx;
}

/**
 * Compute the diary signal for a single quote's event_date.
 * Counts the whole day, including the current booking when already
 * accepted. This matches the diary total rather than an "other" count.
 */
export function computeDiarySignal(
  eventDate: string | Date | null | undefined,
  diaryIndex: Map<string, DiaryEntry[]> | null,
  currentQuoteId?: string,
): DiarySignal {
  const target = toDateKey(eventDate);
  if (!target) {
    return {
      status: "unknown",
      sameDay: [],
      nearby: [],
      sweetenerWorthwhile: false,
      headline: "No event date set",
      detail: "Add a date so the diary can flag gaps.",
    };
  }

  if (!diaryIndex) return {
    status: "unknown", sameDay: [], nearby: [], sweetenerWorthwhile: false,
    headline: "Diary count unavailable", detail: "Refresh to check bookings for this date.",
  };

  const sameDay = diaryIndex.get(target) || [];
  const includesCurrent = !!currentQuoteId && sameDay.some((entry) => entry.quoteId === currentQuoteId
    || (entry.kind === "accepted_quote" && entry.sourceId === currentQuoteId));

  // ±2 day window. Includes the day itself for label clarity, then we
  // strip same-day entries when computing the 'nearby' slice.
  const nearby: DiaryEntry[] = [];
  const t = new Date(target + "T12:00:00");
  for (let offset = -2; offset <= 2; offset += 1) {
    if (offset === 0) continue;
    const d = new Date(t.getTime() + offset * DAY_MS);
    const key = toDateKey(d);
    if (!key) continue;
    const hits = diaryIndex.get(key) || [];
    nearby.push(...hits);
  }

  let status: DiaryStatus;
  let headline: string;
  let detail: string;

  if (sameDay.length >= 2) {
    status = "stacked";
    headline = `${sameDay.length} bookings that day`;
    detail = `${includesCurrent ? "Includes this booking. " : ""}${sameDay.slice(0, 3).map((e) => e.label).join(", ")}${sameDay.length > 3 ? ` +${sameDay.length - 3} more` : ""}`;
  } else if (sameDay.length === 1) {
    status = "one_booking";
    headline = "One booking that day";
    const e = sameDay[0];
    detail = `${includesCurrent ? "This booking" : "Already booked"}: ${e.label}${e.guests ? ` (${e.guests} guests)` : ""}`;
  } else if (nearby.length === 0) {
    status = "wide_open";
    headline = "Wide-open day";
    detail = "Nothing booked within 2 days, ideal candidate for a sweetener.";
  } else if (nearby.length <= 2) {
    status = "quiet";
    headline = "Quiet day";
    detail = `Only ${nearby.length} booking${nearby.length === 1 ? "" : "s"} nearby. Worth pushing.`;
  } else {
    status = "quiet";
    headline = "Quiet same-day, busy week";
    detail = `${nearby.length} bookings within 2 days but the day itself is open.`;
  }

  const sweetenerWorthwhile = status === "wide_open" || status === "quiet";

  return { status, sameDay, nearby, sweetenerWorthwhile, headline, detail };
}

/**
 * Tailwind tone classes per diary status, used to keep the chip on the
 * row and the diary callout in the compose drawer in lockstep.
 */
export const DIARY_TONE: Record<DiaryStatus, { chip: string; dot: string; label: string }> = {
  wide_open:  { chip: "bg-brand-primary/10 text-brand-primary border-brand-primary/20", dot: "bg-brand-primary",   label: "Wide open" },
  quiet:      { chip: "bg-sky-50 text-sky-700 border-sky-200",             dot: "bg-sky-500",       label: "Quiet"     },
  one_booking:{ chip: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500",     label: "1 booked"  },
  stacked:    { chip: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500",     label: "Multiple bookings" },
  unknown:    { chip: "bg-slate-50 text-slate-500 border-slate-200",       dot: "bg-slate-300",     label: "No date"   },
};
