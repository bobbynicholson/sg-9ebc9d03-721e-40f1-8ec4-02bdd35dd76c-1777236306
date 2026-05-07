/**
 * Local-timezone date helpers.
 *
 * Why this exists:
 *   `new Date().toISOString().slice(0, 10)` is the most popular way
 *   to get a "today" string in JS, and it's wrong for anyone east of
 *   the prime meridian. In SA (UTC+2), at 00:30 SAST the user is
 *   clearly on the new day, but `toISOString()` returns 22:30Z of
 *   the previous day, so the slice produces yesterday. The same trap
 *   bit our calendar grid: cells built with new Date(year, month, day)
 *   are local midnight, which is the previous UTC day, so every
 *   event ended up rendered one cell to the right of where it should.
 *
 *   These helpers do the formatting from the Date's local-tz
 *   components directly. No UTC conversion. The output matches what
 *   the user sees on their wall clock.
 */

/**
 * Format a Date as YYYY-MM-DD using its local timezone.
 *
 * Use anywhere a calendar cell key, "today" comparison, day filter,
 * or display-only date string needs to match the user's actual day.
 * Equivalent to toISOString().slice(0,10) on a server running in UTC,
 * but correct everywhere else.
 */
export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
