/**
 * Shared staff-pay computation for the three pay models a company can
 * put a staff member on: hourly, monthly salary, or per-shift.
 *
 * Why this module exists: pay used to be computed in three different
 * places (the wage report kitchenStaffService.getWageSummary, the
 * payslip kitchenPayService.summariseStaffPay, and the clock-in ledger
 * timeClockService), and only the wage REPORT understood monthly /
 * shift pay. The payslip and the payout ledger were hourly-only, so a
 * salaried or per-shift staffer showed the right number on
 * /admin/wages but got R0 on their actual payslip and R0 in the payout
 * ledger. Centralising the maths here keeps every surface in agreement
 * (the standing "no data inconsistency anywhere" rule).
 *
 * Money is rounded to 2dp at each computed value, matching the rest of
 * the pay stack.
 */

export type StaffPayType = "hourly" | "monthly" | "shift";

/** Round to 2 decimal places (rand cents), NaN-safe. */
export function round2(n: number | string | null | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/**
 * Coerce a raw pay_type value from the DB to a known enum. Anything
 * unrecognised (null, "", a legacy value, a driver/admin with no
 * kitchen_staff_members row) falls back to "hourly" - the safe default
 * that preserves the historic behaviour for everyone not explicitly
 * put on salary or per-shift pay.
 */
export function normalizePayType(v: unknown): StaffPayType {
  return v === "monthly" || v === "shift" ? v : "hourly";
}

/**
 * Calendar-accurate fraction of a MONTHLY salary earned across the
 * inclusive date window [startDateISO, endDateISO] (both "YYYY-MM-DD").
 *
 * Each day in the window contributes 1/daysInThatMonth, so a full
 * calendar month totals exactly 1.0 whether it has 28, 30 or 31 days.
 * This mirrors kitchenStaffService.getWageSummary's monthFraction so
 * the payslip and the wage report agree to the cent for salaried staff.
 * A naive windowDays/30 would over-pay 31-day months and under-pay
 * February.
 *
 * Returns 0 for an empty or inverted window.
 */
export function monthlySalaryFraction(startDateISO: string, endDateISO: string): number {
  const startMs = Date.parse(`${startDateISO}T00:00:00.000Z`);
  // endDateISO is inclusive, so the exclusive upper bound is the day
  // after it at 00:00.
  const endMs = Date.parse(`${endDateISO}T00:00:00.000Z`) + 86_400_000;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(endMs > startMs)) {
    return 0;
  }
  let frac = 0;
  let guard = 0;
  for (let t = startMs; t < endMs && guard < 4000; t += 86_400_000, guard++) {
    const d = new Date(t);
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    frac += 1 / daysInMonth;
  }
  return frac;
}

/**
 * Period pay for a MONTHLY-salaried staffer over an inclusive date
 * window. Salary is prorated by monthlySalaryFraction.
 */
export function computeMonthlyPeriodPay(
  monthlySalary: number | null | undefined,
  startDateISO: string,
  endDateISO: string,
): number {
  return round2((Number(monthlySalary) || 0) * monthlySalaryFraction(startDateISO, endDateISO));
}

/**
 * Period pay for a PER-SHIFT staffer: flat rate times the number of
 * shifts worked in the window.
 */
export function computeShiftPeriodPay(
  shiftRate: number | null | undefined,
  shiftCount: number | null | undefined,
): number {
  return round2((Number(shiftRate) || 0) * (Number(shiftCount) || 0));
}

export interface SessionRateContext {
  hours: number | null | undefined;
  hourlyRate: number | null | undefined;
  shiftRate?: number | null | undefined;
  // Optional BCEA context for HOURLY staff. When supplied, hourly pay
  // splits daily overtime (over the threshold at overtimeRate) and pays
  // the whole session at the Sunday/public-holiday rate when the day is
  // one. Omit them all for a flat hours x rate (the back-compatible
  // default). The weekly 45h ordinary cap is NOT applied per session -
  // that cross-shift split lives in the wage report; a single clock-out
  // has no cheap view of week-to-date ordinary minutes.
  overtimeThresholdHours?: number | null;
  overtimeRate?: number | null;      // default = hourlyRate * 1.5
  sundayHolidayRate?: number | null; // default = hourlyRate * 2
  isSundayOrHoliday?: boolean;
}

/**
 * Earnings for a SINGLE clocked session, by pay type. Used at
 * clock-out and for manager-backfilled manual sessions.
 *
 * - hourly: hours x rate, with an optional BCEA split (see
 *           SessionRateContext) - daily overtime at 1.5x and
 *           Sunday/public-holiday at 2x when the context is supplied.
 * - shift:  one flat shift_rate, regardless of the session length -
 *           one clocked session is one shift.
 * - monthly: 0. A salaried staffer is NOT paid per session; their pay
 *           is issued as a prorated period payslip on
 *           /admin/kitchen-settlement. Accruing a per-session rand here
 *           too would double-pay them and inflate the "owed to staff"
 *           ledger.
 */
export function computeSessionEarnings(
  payType: unknown,
  ctx: SessionRateContext,
): number {
  const pt = normalizePayType(payType);
  if (pt === "monthly") return 0;
  if (pt === "shift") return round2(ctx.shiftRate);

  const hours = Number(ctx.hours) || 0;
  const rate = Number(ctx.hourlyRate) || 0;

  // Sunday / public holiday: the whole session pays at the premium rate
  // (BCEA s16 - default 2x hourly).
  if (ctx.isSundayOrHoliday) {
    const sunRate = ctx.sundayHolidayRate != null ? Number(ctx.sundayHolidayRate) : rate * 2;
    return round2(hours * sunRate);
  }

  // Daily overtime: hours beyond the threshold pay at overtimeRate
  // (default 1.5x). No threshold supplied -> flat hours x rate.
  const threshold = ctx.overtimeThresholdHours != null && Number(ctx.overtimeThresholdHours) > 0
    ? Number(ctx.overtimeThresholdHours)
    : Infinity;
  const baseHours = Math.min(hours, threshold);
  const otHours = Math.max(0, hours - threshold);
  const otRate = ctx.overtimeRate != null ? Number(ctx.overtimeRate) : rate * 1.5;
  return round2(baseHours * rate + otHours * otRate);
}
