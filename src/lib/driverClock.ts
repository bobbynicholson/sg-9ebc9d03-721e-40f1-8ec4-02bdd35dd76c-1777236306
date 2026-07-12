/**
 * Pure driver-clock decisions shared by the dashboard and its regression
 * tests. Keeping this separate from the Supabase calls makes the payroll
 * invariant explicit: a completed session is immutable; clocking in again
 * creates a new session instead of erasing the first clock-out.
 */

export interface DriverClockShiftRow {
  id: string;
  actual_start: string | null;
  actual_end: string | null;
  planned_start?: string | null;
  status?: string | null;
}

export type DriverClockInDecision =
  | { kind: "already_open"; shift: DriverClockShiftRow }
  | { kind: "start_rostered"; shift: DriverClockShiftRow }
  | { kind: "create_session" };

/**
 * Pick the only safe action for a clock-in attempt.
 *
 * Completed rows are deliberately ignored. Reopening one by clearing
 * `actual_end` turns the off-duty gap into paid time and destroys the first
 * clock-out audit stamp. The database permits multiple completed delivery
 * sessions per day; only a still-open row or an unstarted roster row is
 * reused.
 */
export function decideDriverClockIn(
  rows: DriverClockShiftRow[],
): DriverClockInDecision {
  const open = rows.find((row) => Boolean(row.actual_start) && !row.actual_end);
  if (open) return { kind: "already_open", shift: open };

  // Do not resurrect cancelled/missed rows. If a driver arrives after the
  // missed-clock cron, their real work becomes a fresh unplanned session and
  // the missed roster row remains an honest audit record.
  const rostered = rows.find(
    (row) => !row.actual_start && row.status === "scheduled",
  );
  if (rostered) return { kind: "start_rostered", shift: rostered };

  return { kind: "create_session" };
}

/** Sum actual session time without filling the gaps between split shifts. */
export function sumDriverShiftMilliseconds(
  rows: Array<Pick<DriverClockShiftRow, "actual_start" | "actual_end">>,
  nowMs = Date.now(),
): number {
  return rows.reduce((total, row) => {
    if (!row.actual_start) return total;
    const startMs = new Date(row.actual_start).getTime();
    const endMs = row.actual_end ? new Date(row.actual_end).getTime() : nowMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return total;
    }
    return total + (endMs - startMs);
  }, 0);
}
