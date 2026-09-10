/**
 * Time math shared by workforce screens and dispatch gates.
 *
 * All intervals are half-open: [start, end). This makes two jobs that meet
 * at exactly the same instant non-overlapping, while jobs that share even a
 * millisecond are merged once. The union is calculated per person, so two
 * people working the same order are both paid, but one person working two
 * orders at once is only counted once.
 */

export type IntervalLike = {
  start: Date | string | number;
  end?: Date | string | number | null;
};

export type EpochInterval = { start: number; end: number };

function epoch(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

/** Convert, discard invalid intervals, and keep open intervals open to now. */
export function normalizeInterval(
  interval: IntervalLike,
  nowMs = Date.now(),
): EpochInterval | null {
  const start = epoch(interval.start);
  const end = interval.end == null ? nowMs : epoch(interval.end);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

/** Return the disjoint union of all valid intervals. */
export function unionIntervals(
  intervals: IntervalLike[],
  nowMs = Date.now(),
): EpochInterval[] {
  const normalized = intervals
    .map((interval) => normalizeInterval(interval, nowMs))
    .filter((interval): interval is EpochInterval => Boolean(interval))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const union: EpochInterval[] = [];
  for (const interval of normalized) {
    const previous = union[union.length - 1];
    if (!previous || interval.start > previous.end) {
      union.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return union;
}

export function unionMilliseconds(intervals: IntervalLike[], nowMs = Date.now()): number {
  return unionIntervals(intervals, nowMs)
    .reduce((total, interval) => total + interval.end - interval.start, 0);
}

export function unionHours(intervals: IntervalLike[], nowMs = Date.now()): number {
  return unionMilliseconds(intervals, nowMs) / 3_600_000;
}

export function intervalsOverlap(a: IntervalLike, b: IntervalLike, nowMs = Date.now()): boolean {
  const left = normalizeInterval(a, nowMs);
  const right = normalizeInterval(b, nowMs);
  return Boolean(left && right && left.start < right.end && right.start < left.end);
}

/** Clip an interval to a reporting window, preserving half-open semantics. */
export function clipInterval(
  interval: IntervalLike,
  window: { start: Date | string | number; end: Date | string | number },
  nowMs = Date.now(),
): EpochInterval | null {
  const value = normalizeInterval(interval, nowMs);
  const from = epoch(window.start);
  const to = epoch(window.end);
  if (!value || from == null || to == null || to <= from) return null;
  const start = Math.max(value.start, from);
  const end = Math.min(value.end, to);
  return end > start ? { start, end } : null;
}

/** Build the conservative dispatch window around a scheduled event. */
export function slidingWindow(
  eventDate: string,
  eventTime: string | null | undefined,
  bufferMinutes = 180,
): EpochInterval | null {
  if (!eventDate || !eventTime || !Number.isFinite(bufferMinutes) || bufferMinutes < 0) return null;
  const event = new Date(`${eventDate}T${eventTime}`).getTime();
  if (!Number.isFinite(event)) return null;
  const padding = bufferMinutes * 60_000;
  return { start: event - padding, end: event + padding };
}
