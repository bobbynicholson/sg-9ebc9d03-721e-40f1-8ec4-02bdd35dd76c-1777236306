/**
 * Kitchen pay calculation + payslip persistence.
 *
 * Wave 36.3. Simpler than driverPayService.ts because there's no
 * distance / callout / vehicle add-on - kitchen pay is just:
 *
 *   total_pay  =  base_pay + overtime_pay + multiplier_pay
 *
 *   base_pay      = standard_hours * hourly_rate
 *   overtime_pay  = OT_hours * hourly_rate * 1.5     (where OT = any
 *                   single-shift hours over the tenant's
 *                   overtimeAfterHours setting, default 9)
 *   multiplier_pay= multiplier_hours * hourly_rate *
 *                   (rate_multiplier - 1)            (additional
 *                   premium for shifts marked 1.5x or 2x via the
 *                   roster modal - BCEA Sundays / public holidays)
 *
 * Reads from kitchen_duty_shifts (live actuals) joined to
 * kitchen_shifts (roster, for the rate_multiplier). Persists to
 * kitchen_payslips. Idempotent on (company_id, staff_id,
 * period_start, period_end) - a re-summarise lands on the same
 * row.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";
import { toZonedISO } from "@/lib/localDate";
import {
  type StaffPayType,
  normalizePayType,
  computeMonthlyPeriodPay,
  computeShiftPeriodPay,
} from "@/lib/payroll/payTypes";

const DEFAULT_OT_AFTER_HOURS = 9;
const OT_RATE_MULTIPLIER = 1.5;

export interface ShiftLine {
  shift_id: string;
  shift_date: string | null; // YYYY-MM-DD; null when the source clock date is missing
  source: "kitchen_staff_shifts" | "kitchen_duty_shifts";
  shift_start: string | null;
  shift_end: string | null;
  total_break_min: number;
  worked_minutes?: number; // exact approved minutes used by Wages
  notes: string | null;
  needs_review: boolean;
  review_reason: string | null;
  hours: number;            // worked hours after break deduction
  rate_multiplier: number;  // 1, 1.5, 2
  base_hours: number;       // up to OT cutoff
  ot_hours: number;         // beyond OT cutoff
  sunday_holiday_hours?: number; // BCEA Sunday / public-holiday minutes
  base_pay: number;
  ot_pay: number;
  multiplier_pay: number;
  line_total: number;
}

export interface PaySummary {
  staffId: string;
  staffName: string | null;
  hourlyRate: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  basePay: number;
  overtimePay: number;
  multiplierPay: number;
  totalPay: number;
  shifts: ShiftLine[];
  shiftsNeedingReview: number;
  // Pay model this total was computed under. "hourly" = the shift-line
  // roll-up below; "monthly" = salary prorated to the period; "shift" =
  // flat rate x shift count. For monthly/shift the shifts[] array is
  // still populated as an attendance record, but the pay figures come
  // from the salary / shift rate, not the hourly line totals.
  payType: StaffPayType;
  monthlySalary: number | null;
  shiftRate: number | null;
}

interface DutyShiftRow {
  id: string;
  staff_id: string;
  shift_start: string | null;
  shift_end: string | null;
  total_break_min: number | null;
  end_note?: string | null;
  is_active?: boolean | null;
}

interface KitchenShiftRow {
  staff_id: string;
  shift_date: string;
  rate_multiplier: number | null;
  duty_shift_id: string | null;
}

/** The current kitchen tablet / roster source of truth. Its BCEA minute
 * buckets are stamped at clock-out, so settlement must use them rather than
 * trying to recreate weekly and holiday rules from a legacy duty session. */
interface KitchenStaffShiftRow {
  id: string;
  shift_start: string | null;
  shift_end: string | null;
  total_break_min: number | null;
  notes?: string | null;
  standard_min: number | null;
  overtime_min: number | null;
  sunday_holiday_min: number | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  hourly_rate: number | null;
}

interface CompanyRow {
  id: string;
  currency: string | null;
  kitchen_settings: any;
}

/**
 * Summarise kitchen pay for one staffer over a date window.
 * Read-only - does NOT persist. Use persistPayslip() to lock it in.
 */
export async function summariseStaffPay(
  supabase: SupabaseClient,
  args: {
    companyId: string;
    staffId: string;
    periodStart: string; // YYYY-MM-DD inclusive
    periodEnd: string;   // YYYY-MM-DD inclusive
    rangeStartISO?: string; // Exact UI date-window boundary shared with Wages
    rangeEndExclusiveISO?: string;
  },
): Promise<PaySummary> {
  const { companyId, staffId, periodStart, periodEnd, rangeStartISO, rangeEndExclusiveISO } = args;
  const startIso = rangeStartISO || `${periodStart}T00:00:00.000Z`;
  const utcEndExclusive = new Date(`${periodEnd}T00:00:00.000Z`);
  utcEndExclusive.setUTCDate(utcEndExclusive.getUTCDate() + 1);
  const endExclusiveIso = rangeEndExclusiveISO || utcEndExclusive.toISOString();

  // Pull the staff profile (for hourly_rate + display name).
  const { data: profile, error: profileError } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, email, hourly_rate")
    .eq("id", staffId)
    .maybeSingle();
  if (profileError) throw profileError;
  const profileTyped = profile as ProfileRow | null;

  // Pay model lives on kitchen_staff_members (pay_type / monthly_salary
  // / shift_rate), linked to this profile. profiles has no pay_type, so
  // a staffer with no linked kitchen_staff_members row is treated as
  // hourly - the safe historic default. This is the fix for salaried /
  // per-shift staff previously getting an R0 payslip because only the
  // hourly branch existed here.
  const { data: ksm, error: ksmError } = await (supabase as any)
    .from("kitchen_staff_members")
    .select("id, hourly_rate, overtime_rate, sunday_holiday_rate, pay_type, monthly_salary, shift_rate")
    .eq("company_id", companyId)
    .eq("linked_profile_id", staffId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (ksmError) throw ksmError;
  // Staff & Rates owns the kitchen hourly rate. Older linked profiles may
  // still carry a rate there, so retain it as a backwards-compatible fallback.
  const hourlyRate = Number((ksm as any)?.hourly_rate ?? profileTyped?.hourly_rate) || 0;
  const overtimeRate = Number((ksm as any)?.overtime_rate) || hourlyRate * OT_RATE_MULTIPLIER;
  const sundayHolidayRate = Number((ksm as any)?.sunday_holiday_rate) || hourlyRate * 2;
  const payType = normalizePayType((ksm as any)?.pay_type);
  const monthlySalary = (ksm as any)?.monthly_salary != null ? Number((ksm as any).monthly_salary) : null;
  const shiftRate = (ksm as any)?.shift_rate != null ? Number((ksm as any).shift_rate) : null;

  // For per-shift pay, count shifts from the SAME source the wage
  // report uses (kitchen_staff_shifts roster, keyed by the staff-member
  // id), NOT the duty-clock actuals below - otherwise the payslip and
  // /admin/wages disagree for a rostered staffer who doesn't self-clock.
  // Only queried for shift staff with a linked staff-member row.
  let rosterShiftCount: number | null = null;
  if (payType === "shift" && (ksm as any)?.id) {
    const { count, error: rosterCountError } = await (supabase as any)
      .from("kitchen_staff_shifts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("staff_member_id", (ksm as any).id)
      .gte("shift_start", startIso)
      .lt("shift_start", endExclusiveIso)
      .not("shift_end", "is", null)
      .is("deleted_at", null);
    if (rosterCountError) throw rosterCountError;
    rosterShiftCount = count || 0;
  }

  // Tenant currency + overtime threshold.
  const { data: company, error: companyError } = await (supabase as any)
    .from("companies")
    .select("id, currency, kitchen_settings, timezone")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) throw companyError;
  const companyTyped = company as CompanyRow | null;
  const currency = companyTyped?.currency || "ZAR";
  // Tenant wall-clock timezone for the Sunday/holiday multiplier date
  // match. The roster's shift_date is stored in tenant-local terms; the
  // duty shift_end is a timestamptz, so it must be resolved to the same
  // tenant day (not the server's UTC day) or the premium silently misses.
  const tenantTz = (company as any)?.timezone as string | null | undefined;
  // The panel persists this jsonb key snake_case (overtime_after_hours);
  // the old camelCase read (overtimeAfterHours) always missed, so the pay
  // engine silently used DEFAULT_OT_AFTER_HOURS regardless of the tenant's
  // setting - the duty board (which reads it correctly) and the payslip
  // then disagreed. Read snake_case first, fall back to camelCase for any
  // legacy rows, then the platform default.
  const ks = companyTyped?.kitchen_settings ?? {};
  const overtimeAfter = Number(
    ks.overtime_after_hours ?? ks.overtimeAfterHours ?? DEFAULT_OT_AFTER_HOURS,
  );

  // Match Wages' date-window rule: shifts belong to the period by their
  // start time, including overnight shifts that end on the next day.
  const { data: dutyShifts, error: dutyShiftsError } = await (supabase as any)
    .from("kitchen_duty_shifts")
    .select("id, staff_id, shift_start, shift_end, total_break_min, end_note, is_active")
    .eq("company_id", companyId)
    .eq("staff_id", staffId)
    .gte("shift_start", startIso)
    .lt("shift_start", endExclusiveIso)
    .not("shift_end", "is", null)
;
  if (dutyShiftsError) throw dutyShiftsError;

  // Stale open clocks are surfaced as review-only rows. A current shift is
  // normal while someone is working; after 14 hours it is more likely a
  // missed clock-out and must be corrected before a payslip is issued.
  const [openDutyResult, openStaffResult] = await Promise.all([
    (supabase as any)
      .from("kitchen_duty_shifts")
      .select("id, staff_id, shift_start, shift_end, total_break_min, end_note, is_active")
      .eq("company_id", companyId)
      .eq("staff_id", staffId)
      .eq("is_active", true)
      .is("shift_end", null)
      .gte("shift_start", startIso)
      .lt("shift_start", endExclusiveIso),
    (ksm as any)?.id
      ? (supabase as any)
        .from("kitchen_staff_shifts")
        .select("id, shift_start, shift_end, total_break_min, notes, standard_min, overtime_min, sunday_holiday_min")
        .eq("company_id", companyId)
        .eq("staff_member_id", (ksm as any).id)
        .is("shift_end", null)
        .gte("shift_start", startIso)
        .lt("shift_start", endExclusiveIso)
        .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (openDutyResult.error) throw openDutyResult.error;
  if (openStaffResult.error) throw openStaffResult.error;

  // kitchen_staff_shifts is the active roster/tablet clock. The legacy duty
  // source is retained below solely for historical records that predate it.
  let currentShiftRows: KitchenStaffShiftRow[] = [];
  if ((ksm as any)?.id) {
    const { data, error } = await (supabase as any)
      .from("kitchen_staff_shifts")
      .select("id, shift_start, shift_end, total_break_min, notes, standard_min, overtime_min, sunday_holiday_min")
      .eq("company_id", companyId)
      .eq("staff_member_id", (ksm as any).id)
      .gte("shift_start", startIso)
      .lt("shift_start", endExclusiveIso)
      .not("shift_end", "is", null)
      .is("deleted_at", null);
    if (error) throw error;
    currentShiftRows = (data || []) as KitchenStaffShiftRow[];
  }

  // Pull every roster row in the same window so we can pick up the
  // rate_multiplier (Sunday / OT premium). Match by duty_shift_id
  // (set on clock-in) when present, otherwise by date proximity.
  //
  // Wave 41 (CRITICAL FIX): scope to kitchen-side shift_types only.
  // Once cleaning shifts started living in this same table (Wave 40.4
  // shift_type column), an unfiltered query would mix a cleaner's
  // hours into the chef's pay run for any staffer who does both.
  // 'kitchen_and_cleaning' counts on the kitchen side because the
  // multiplier was set during kitchen rostering.
  const { data: rosterRows, error: rosterRowsError } = await (supabase as any)
    .from("kitchen_shifts")
    .select("staff_id, shift_date, rate_multiplier, duty_shift_id")
    .eq("company_id", companyId)
    .eq("staff_id", staffId)
    .in("shift_type", ["kitchen", "kitchen_and_cleaning"])
    .gte("shift_date", periodStart)
    .lte("shift_date", periodEnd)
    .is("deleted_at", null)
;
  if (rosterRowsError) throw rosterRowsError;
  const multiplierByDuty = new Map<string, number>();
  const multiplierByDate = new Map<string, number>();
  for (const r of (rosterRows || []) as KitchenShiftRow[]) {
    const m = Number(r.rate_multiplier) || 1;
    if (r.duty_shift_id) multiplierByDuty.set(r.duty_shift_id, m);
    if (r.shift_date) multiplierByDate.set(r.shift_date, m);
  }

  const shifts: ShiftLine[] = [];
  const legacyRows = ((dutyShifts || []) as DutyShiftRow[]).filter((legacy) => {
    // Some records exist in both clock tables. Match both timestamps
    // within two minutes so the same shift is never paid twice.
    return !currentShiftRows.some((current) => {
      if (!current.shift_start || !current.shift_end || !legacy.shift_start || !legacy.shift_end) return false;
      return Math.abs(new Date(current.shift_start).getTime() - new Date(legacy.shift_start).getTime()) <= 2 * 60_000 &&
        Math.abs(new Date(current.shift_end).getTime() - new Date(legacy.shift_end).getTime()) <= 2 * 60_000;
    });
  });
  const rowsToSettle: DutyShiftRow[] = [
    ...currentShiftRows.map((shift) => ({
      id: shift.id,
      staff_id: staffId,
      shift_start: shift.shift_start,
      shift_end: shift.shift_end,
      total_break_min: shift.total_break_min,
    })),
    ...legacyRows,
  ];
  const currentShiftById = new Map(currentShiftRows.map((shift) => [shift.id, shift]));

  for (const ds of rowsToSettle) {
    const startMs = ds.shift_start ? new Date(ds.shift_start).getTime() : Number.NaN;
    const endMs = ds.shift_end ? new Date(ds.shift_end).getTime() : Number.NaN;
    const grossMin = Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.floor((endMs - startMs) / 60000)
      : 0;
    const breakMin = Number(ds.total_break_min) || 0;
    const reasons: string[] = [];
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) reasons.push("Missing or invalid clock time");
    else if (grossMin <= 0) reasons.push("Clock-out must be after clock-in");
    else if (grossMin > 24 * 60) reasons.push("Shift is longer than 24 hours");
    if (!Number.isFinite(breakMin) || breakMin < 0) reasons.push("Break minutes are invalid");
    else if (grossMin > 0 && breakMin > grossMin) reasons.push("Break exceeds the clocked shift");
    const workedMin = grossMin > 0 && breakMin >= 0 && breakMin <= grossMin
      ? grossMin - breakMin
      : 0;
    const hours = Math.round((workedMin / 60) * 100) / 100;

    // Current rows already hold the BCEA split calculated when the person
    // clocked out (including the weekly cap and public-holiday bucket).
    // Using those persisted minutes keeps settlement exactly aligned with
    // Wages and avoids treating a valid scheduled/clocked shift as zero.
    const currentRow = currentShiftById.get(ds.id);
    if (currentRow) {
      const standardHours = Math.max(0, Number(currentRow.standard_min) || 0) / 60;
      const overtimeHours = Math.max(0, Number(currentRow.overtime_min) || 0) / 60;
      const sundayHolidayHours = Math.max(0, Number(currentRow.sunday_holiday_min) || 0) / 60;
      const recordedMin = Math.round((standardHours + overtimeHours + sundayHolidayHours) * 60);
      if (recordedMin > 0 && Math.abs(recordedMin - workedMin) > 3) {
        reasons.push("Recorded pay minutes do not match the clock interval");
      }
      if (recordedMin === 0 && workedMin > 0) {
        reasons.push("Recorded pay minutes are missing");
      }
      const recordedHours = recordedMin > 0 ? recordedMin / 60 : workedMin / 60;
      if (reasons.length > 0) {
        shifts.push({
          shift_id: ds.id,
          shift_date: Number.isFinite(endMs) ? toZonedISO(new Date(endMs), tenantTz) : Number.isFinite(startMs) ? toZonedISO(new Date(startMs), tenantTz) : null,
          source: "kitchen_staff_shifts",
          shift_start: ds.shift_start,
          shift_end: ds.shift_end,
          total_break_min: breakMin,
          worked_minutes: 0,
          notes: currentRow.notes || null,
          needs_review: true,
          review_reason: reasons.join("; "),
          hours: 0,
          rate_multiplier: 1,
          base_hours: 0,
          ot_hours: 0,
          sunday_holiday_hours: 0,
          base_pay: 0,
          ot_pay: 0,
          multiplier_pay: 0,
          line_total: 0,
        });
        continue;
      }
      if (recordedHours > 0 || workedMin === 0) {
        const basePay = Math.round((standardHours + sundayHolidayHours) * hourlyRate * 100) / 100;
        const otPay = Math.round(overtimeHours * overtimeRate * 100) / 100;
        const multiplierPay = Math.round(sundayHolidayHours * (sundayHolidayRate - hourlyRate) * 100) / 100;
        shifts.push({
          shift_id: ds.id,
          shift_date: toZonedISO(new Date(endMs), tenantTz),
          source: "kitchen_staff_shifts",
          shift_start: ds.shift_start,
          shift_end: ds.shift_end,
          total_break_min: breakMin,
          worked_minutes: recordedMin,
          notes: currentRow.notes || null,
          needs_review: false,
          review_reason: null,
          hours: Math.round(recordedHours * 100) / 100,
          rate_multiplier: sundayHolidayHours > 0 && hourlyRate > 0 ? sundayHolidayRate / hourlyRate : 1,
          base_hours: standardHours + sundayHolidayHours,
          ot_hours: overtimeHours,
          sunday_holiday_hours: sundayHolidayHours,
          base_pay: basePay,
          ot_pay: otPay,
          multiplier_pay: multiplierPay,
          line_total: Math.round((basePay + otPay + multiplierPay) * 100) / 100,
        });
        continue;
      }
    }

    // Resolve multiplier: prefer the explicit roster -> duty link.
    // Fall back to date match. Default 1x.
    const shiftDate = Number.isFinite(endMs)
      ? toZonedISO(new Date(endMs), tenantTz)
      : Number.isFinite(startMs)
        ? toZonedISO(new Date(startMs), tenantTz)
        : periodStart;
    const multiplier =
      multiplierByDuty.get(ds.id) ||
      multiplierByDate.get(shiftDate) ||
      1;

    if (reasons.length > 0) {
      shifts.push({
        shift_id: ds.id,
        shift_date: Number.isFinite(endMs) ? toZonedISO(new Date(endMs), tenantTz) : Number.isFinite(startMs) ? toZonedISO(new Date(startMs), tenantTz) : null,
        source: "kitchen_duty_shifts",
        shift_start: ds.shift_start,
        shift_end: ds.shift_end,
        total_break_min: breakMin,
        worked_minutes: 0,
        notes: ds.end_note || null,
        needs_review: true,
        review_reason: reasons.join("; "),
        hours: 0,
        rate_multiplier: multiplier,
        base_hours: 0,
        ot_hours: 0,
        sunday_holiday_hours: 0,
        base_pay: 0,
        ot_pay: 0,
        multiplier_pay: 0,
        line_total: 0,
      });
      continue;
    }

    const baseHours = Math.min(hours, overtimeAfter);
    const otHours = Math.max(0, hours - overtimeAfter);

    const basePay = Math.round(baseHours * hourlyRate * 100) / 100;
    const otPay = Math.round(otHours * overtimeRate * 100) / 100;
    // Premium ON TOP of base pay (e.g. 2x Sunday adds 1x base pay).
    const multiplierPay = multiplier > 1
      ? Math.round(hours * hourlyRate * (multiplier - 1) * 100) / 100
      : 0;

    shifts.push({
      shift_id: ds.id,
      shift_date: shiftDate,
      source: "kitchen_duty_shifts",
      shift_start: ds.shift_start,
      shift_end: ds.shift_end,
      total_break_min: breakMin,
      worked_minutes: workedMin,
      notes: ds.end_note || null,
      needs_review: false,
      review_reason: null,
      hours,
      rate_multiplier: multiplier,
      base_hours: baseHours,
      ot_hours: otHours,
      sunday_holiday_hours: multiplier > 1 ? hours : 0,
      base_pay: basePay,
      ot_pay: otPay,
      multiplier_pay: multiplierPay,
      line_total: Math.round((basePay + otPay + multiplierPay) * 100) / 100,
    });
  }

  const openStaffRows = ((openStaffResult.data || []) as KitchenStaffShiftRow[]);
  const staleThresholdMs = 14 * 60 * 60 * 1000;
  const now = Date.now();
  for (const row of openStaffRows) {
    const startedAt = row.shift_start ? new Date(row.shift_start).getTime() : Number.NaN;
    if (!Number.isFinite(startedAt) || now - startedAt <= staleThresholdMs) continue;
    shifts.push({
      shift_id: row.id,
      shift_date: toZonedISO(new Date(startedAt), tenantTz),
      source: "kitchen_staff_shifts",
      shift_start: row.shift_start,
      shift_end: null,
      total_break_min: Number(row.total_break_min) || 0,
      worked_minutes: 0,
      notes: row.notes || null,
      needs_review: true,
      review_reason: "Clock is still open more than 14 hours after starting",
      hours: 0,
      rate_multiplier: 1,
      base_hours: 0,
      ot_hours: 0,
      sunday_holiday_hours: 0,
      base_pay: 0,
      ot_pay: 0,
      multiplier_pay: 0,
      line_total: 0,
    });
  }
  for (const row of (openDutyResult.data || []) as DutyShiftRow[]) {
    const startedAt = row.shift_start ? new Date(row.shift_start).getTime() : Number.NaN;
    if (!Number.isFinite(startedAt) || now - startedAt <= staleThresholdMs) continue;
    const matchesCurrentOpen = openStaffRows.some((current) =>
      current.shift_start && Math.abs(new Date(current.shift_start).getTime() - startedAt) <= 2 * 60_000,
    );
    if (matchesCurrentOpen) continue;
    shifts.push({
      shift_id: row.id,
      shift_date: toZonedISO(new Date(startedAt), tenantTz),
      source: "kitchen_duty_shifts",
      shift_start: row.shift_start,
      shift_end: null,
      total_break_min: Number(row.total_break_min) || 0,
      worked_minutes: 0,
      notes: row.end_note || null,
      needs_review: true,
      review_reason: "Clock is still open more than 14 hours after starting",
      hours: 0,
      rate_multiplier: 1,
      base_hours: 0,
      ot_hours: 0,
      sunday_holiday_hours: 0,
      base_pay: 0,
      ot_pay: 0,
      multiplier_pay: 0,
      line_total: 0,
    });
  }

  const roundMoney = (amount: number) => Math.round(amount * 100) / 100;
  const totalMinutes = shifts.reduce((sum, shift) => sum + (shift.worked_minutes ?? Math.round(shift.hours * 60)), 0);
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
  const ordinaryHours = shifts.reduce((sum, shift) => sum + Math.max(0, shift.base_hours - (shift.sunday_holiday_hours || 0)), 0);
  const overtimeHours = shifts.reduce((sum, shift) => sum + shift.ot_hours, 0);
  const sundayHolidayHours = shifts.reduce((sum, shift) => sum + (shift.sunday_holiday_hours || 0), 0);
  const ordinaryPay = roundMoney(ordinaryHours * hourlyRate);
  const sundayAtFullRatePay = roundMoney(sundayHolidayHours * sundayHolidayRate);
  const hourlyBasePay = ordinaryPay;
  const hourlyOvertimePay = roundMoney(overtimeHours * overtimeRate);
  const hourlyMultiplierPay = sundayAtFullRatePay;

  // Pay model drives the payslip total. hourly = the shift-line
  // roll-up above; monthly = salary prorated to the period; shift =
  // flat rate x shifts worked. monthly/shift zero out the hourly OT /
  // multiplier lines since those concepts don't apply to them, but the
  // shifts[] attendance record is kept for the breakdown.
  let basePay = hourlyBasePay;
  let overtimePay = hourlyOvertimePay;
  let multiplierPay = hourlyMultiplierPay;
  if (payType === "monthly") {
    basePay = computeMonthlyPeriodPay(monthlySalary, periodStart, periodEnd);
    overtimePay = 0;
    // Monthly salary covers ordinary hours; wages adds the extra half of
    // the recorded 2x Sunday / public-holiday rate as a separate premium.
    multiplierPay = roundMoney(sundayHolidayHours * sundayHolidayRate / 2);
  } else if (payType === "shift") {
    // Roster count when available (matches the wage report); fall back
    // to the duty-clock actual count for staff clocked only on the
    // tablet with no roster rows.
    const completedShiftCount = rosterShiftCount ?? shifts.filter((shift) => !shift.needs_review && shift.shift_end).length;
    basePay = computeShiftPeriodPay(shiftRate, completedShiftCount);
    overtimePay = 0;
    const holidayShiftCount = shifts.filter((shift) => !shift.needs_review && (shift.sunday_holiday_hours || 0) > 0).length;
    multiplierPay = roundMoney(Math.max(0, (Number((ksm as any)?.sunday_holiday_shift_rate) || shiftRate * 2) - shiftRate) * holidayShiftCount);
  }
  const totalPay = Math.round((basePay + overtimePay + multiplierPay) * 100) / 100;


    return {
    staffId,
    staffName: profileTyped?.full_name || profileTyped?.email || null,
    hourlyRate,
    currency,
    periodStart,
    periodEnd,
    totalHours,
    basePay,
    overtimePay,
    multiplierPay,
    totalPay,
    shifts,
    shiftsNeedingReview: shifts.filter((shift) => shift.needs_review).length,
    payType,
    monthlySalary,
    shiftRate,
  };
}

/**
 * Persist a payslip row. Idempotent on (company, staff, period) --
 * a re-run lands on the same row via upsert. Status defaults to
 * 'draft'; the admin Issue / Mark paid actions transition it from
 * there.
 */
export async function persistPayslip(
  supabase: SupabaseClient,
  args: {
    companyId: string;
    summary: PaySummary;
    actorUserId: string | null;
    status?: "draft" | "issued" | "paid";
  },
): Promise<{ ok: boolean; payslipId?: string; error?: string }> {
  const { companyId, summary, actorUserId, status = "draft" } = args;
  if (status !== "draft" && summary.shiftsNeedingReview > 0) {
    return {
      ok: false,
      error: `Cannot issue a payslip while ${summary.shiftsNeedingReview} shift record${summary.shiftsNeedingReview === 1 ? " needs" : "s need"} review.`,
    };
  }
  try {
    const row = {
      company_id: companyId,
      staff_id: summary.staffId,
      period_start: summary.periodStart,
      period_end: summary.periodEnd,
      total_hours: summary.totalHours,
      base_pay: summary.basePay,
      overtime_pay: summary.overtimePay,
      multiplier_pay: summary.multiplierPay,
      total_pay: summary.totalPay,
      hourly_rate: summary.hourlyRate,
      currency: summary.currency,
      status,
      issued_at: status === "issued" || status === "paid" ? new Date().toISOString() : null,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      breakdown: {
        shifts: summary.shifts,
        pay_type: summary.payType,
        monthly_salary: summary.monthlySalary,
        shift_rate: summary.shiftRate,
      },
      created_by_user_id: actorUserId,
    };
    const { data, error } = await (supabase as any)
      .from("kitchen_payslips")
      .upsert(row, { onConflict: "company_id,staff_id,period_start,period_end" })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, payslipId: (data as any)?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "persistPayslip crashed" };
  }
}

/**
 * Read existing payslips for a staffer (their personal history view
 * on /team-portal/kitchen/duty).
 */
export async function listPayslipsForStaff(
  supabase: SupabaseClient,
  args: { companyId: string; staffId: string; limit?: number },
): Promise<Array<{
  id: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  total_pay: number;
  currency: string;
  status: string;
  issued_at: string | null;
  paid_at: string | null;
}>> {
  const { companyId, staffId, limit = 12 } = args;
  const { data } = await (supabase as any)
    .from("kitchen_payslips")
    .select("id, period_start, period_end, total_hours, total_pay, currency, status, issued_at, paid_at")
    .eq("company_id", companyId)
    .eq("staff_id", staffId)
    .is("deleted_at", null)
    .order("period_start", { ascending: false })
    .limit(limit);
  return (data || []) as any[];
}
