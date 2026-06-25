/**
 * Quote diary signal - "do we have a gap on this date?"
 *
 * The Quote Management page lifts confirmed orders + accepted quotes
 * from the same company and pivots them by event_date. For each open
 * quote the team sees an at-a-glance signal:
 *
 *   - Wide open       - nothing booked the whole week (push hard)
 *   - Quiet day       - nothing same-day, 1-2 nearby (good fit)
 *   - One booking     - one event the same day (still doable)
 *   - Stacked         - two+ same-day clashes (steady the team first)
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
  /** Source row id - quote id when kind=accepted_quote, order id otherwise.
   *  Used to exclude the current quote from its own diary lookup. */
  sourceId?: string | null;
}

export interface DiarySignal {
  status: DiaryStatus;
  /** Same-day commitments (orders + accepted quotes). */
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
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;
  // YYYY-MM-DD using local components - matches what's stored in
  // postgres date columns when the team enters dates in their tz.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build a Map keyed by YYYY-MM-DD for fast same-day + nearby lookup.
 * Caller passes the raw rows from orders + accepted quotes.
 */
export function buildDiaryIndex(entries: DiaryEntry[]): Map<string, DiaryEntry[]> {
  const idx = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    if (!e.date) continue;
    const list = idx.get(e.date) || [];
    list.push(e);
    idx.set(e.date, list);
  }
  return idx;
}

/**
 * Compute the diary signal for a single quote's event_date.
 * Excludes the current quote itself from the lookup so the team
 * doesn't see "one booking" caused by the quote they're looking at.
 */
export function computeDiarySignal(
  eventDate: string | Date | null | undefined,
  diaryIndex: Map<string, DiaryEntry[]>,
  excludeId?: string,
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

  const sameDay = (diaryIndex.get(target) || []).filter(
    (e) => !excludeId || e.sourceId !== excludeId,
  );

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
    headline = `Stacked, ${sameDay.length} bookings same day`;
    detail = sameDay.slice(0, 3).map((e) => e.label).join(", ");
  } else if (sameDay.length === 1) {
    status = "one_booking";
    headline = "One booking that day";
    const e = sameDay[0];
    detail = `Already booked: ${e.label}${e.guests ? ` (${e.guests} guests)` : ""}`;
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
  stacked:    { chip: "bg-rose-50 text-rose-700 border-rose-200",          dot: "bg-rose-500",      label: "Stacked"   },
  unknown:    { chip: "bg-slate-50 text-slate-500 border-slate-200",       dot: "bg-slate-300",     label: "No date"   },
};
