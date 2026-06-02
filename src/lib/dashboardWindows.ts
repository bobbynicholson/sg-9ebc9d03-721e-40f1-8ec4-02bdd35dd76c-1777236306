/**
 * TIGHTEN I.78 (2026-06-02): canonical window helpers for dashboard widgets.
 *
 * Sixteen widgets across /admin/dashboard hand-rolled the same three
 * date-window calcs:
 *
 *   - "N days ago, ISO timestamp"     for created_at filters
 *   - "N days ago, YYYY-MM-DD"        for event_date filters
 *   - "days since this iso"           for relative-age labels
 *
 * The hand-rolled versions diverged on rounding, on whether they
 * sliced the timestamp or kept the full string, and on whether
 * negative deltas were clamped. Pulling them through these helpers
 * gives the same answer everywhere and makes the YoY / rolling-window
 * refactors easier to follow.
 *
 * No tz subtlety: the underlying math is `Date.now() - n * MS_PER_DAY`
 * which is wall-clock-agnostic. For widgets that need
 * "start-of-tenant-local-day" semantics, prefer toLocalISO directly
 * on a constructed Date.
 */

const MS_PER_DAY = 86_400_000;

/** Full ISO timestamp N days ago. Use for created_at / updated_at
 *  range filters where the timestamp granularity matters. */
export function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * MS_PER_DAY).toISOString();
}

/** YYYY-MM-DD N days ago. Use for event_date / list_date / due_date
 *  range filters where Postgres stores a DATE column. */
export function daysAgoDateOnly(n: number): string {
  return daysAgoIso(n).slice(0, 10);
}

/** Days elapsed between the given ISO and now, rounded to integer,
 *  clamped non-negative. Use for relative-age labels (eg. "5d ago").
 *  Returns 0 when iso is null / undefined / invalid. */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / MS_PER_DAY));
}

/** Days between two ISO timestamps, rounded, sign preserved (positive
 *  if `b` is after `a`). For relative-comparison labels. */
export function daysBetween(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!isFinite(ta) || !isFinite(tb)) return 0;
  return Math.round((tb - ta) / MS_PER_DAY);
}
