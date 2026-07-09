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
  shift_date: string;       // YYYY-MM-DD
  hours: number;            // worked hours after break deduction
  rate_multiplier: number;  // 1, 1.5, 2
  base_hours: number;       // up to OT cutoff
  ot_hours: number;         // beyond OT cutoff
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
}

interface KitchenShiftRow {
  staff_id: string;
  shift_date: string;
  rate_multiplier: number | null;
  duty_shift_id: string | null;
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
  },
): Promise<PaySummary> {
  const { companyId, staffId, periodStart, periodEnd } = args;

  // Pull the staff profile (for hourly_rate + display name).
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, email, hourly_rate")
    .eq("id", staffId)
    .maybeSingle();
  const profileTyped = profile as ProfileRow | null;
  const hourlyRate = Number(profileTyped?.hourly_rate) || 0;

  // Pay model lives on kitchen_staff_members (pay_type / monthly_salary
  // / shift_rate), linked to this profile. profiles has no pay_type, so
  // a staffer with no linked kitchen_staff_members row is treated as
  // hourly - the safe historic default. This is the fix for salaried /
  // per-shift staff previously getting an R0 payslip because only the
  // hourly branch existed here.
  const { data: ksm } = await (supabase as any)
    .from("kitchen_staff_members")
    .select("id, pay_type, monthly_salary, shift_rate")
    .eq("company_id", companyId)
    .eq("linked_profile_id", staffId)
    .maybeSingle();
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
    const endExclusive = new Date(`${periodEnd}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const { count } = await (supabase as any)
      .from("kitchen_staff_shifts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("staff_member_id", (ksm as any).id)
      .gte("shift_start", `${periodStart}T00:00:00.000Z`)
      .lt("shift_start", endExclusive.toISOString())
      .is("deleted_at", null);
    rosterShiftCount = count || 0;
  }

  // Tenant currency + overtime threshold.
  const { data: company } = await (supabase as any)
    .from("companies")
    .select("id, currency, kitchen_settings, timezone")
    .eq("id", companyId)
    .maybeSingle();
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

  // Pull every clocked-out duty shift in the window.
  // Window: shift_end falls between periodStart 00:00 local and
  // periodEnd 23:59 local. Inclusive both ends.
  const startIso = `${periodStart}T00:00:00.000Z`;
  const endIso = `${periodEnd}T23:59:59.999Z`;
  const { data: dutyShifts } = await (supabase as any)
    .from("kitchen_duty_shifts")
    .select("id, staff_id, shift_start, shift_end, total_break_min")
    .eq("company_id", companyId)
    .eq("staff_id", staffId)
    .gte("shift_end", startIso)
    .lte("shift_end", endIso)
    .not("shift_end", "is", null)
;

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
  const { data: rosterRows } = await (supabase as any)
    .from("kitchen_shifts")
    .select("staff_id, shift_date, rate_multiplier, duty_shift_id")
    .eq("company_id", companyId)
    .eq("staff_id", staffId)
    .in("shift_type", ["kitchen", "kitchen_and_cleaning"])
    .gte("shift_date", periodStart)
    .lte("shift_date", periodEnd)
    .is("deleted_at", null)
;
  const multiplierByDuty = new Map<string, number>();
  const multiplierByDate = new Map<string, number>();
  for (const r of (rosterRows || []) as KitchenShiftRow[]) {
    const m = Number(r.rate_multiplier) || 1;
    if (r.duty_shift_id) multiplierByDuty.set(r.duty_shift_id, m);
    if (r.shift_date) multiplierByDate.set(r.shift_date, m);
  }

  const shifts: ShiftLine[] = [];
  for (const ds of (dutyShifts || []) as DutyShiftRow[]) {
    if (!ds.shift_start || !ds.shift_end) continue;
    const startMs = new Date(ds.shift_start).getTime();
    const endMs = new Date(ds.shift_end).getTime();
    const grossMin = Math.max(0, Math.floor((endMs - startMs) / 60000));
    const workedMin = Math.max(0, grossMin - (Number(ds.total_break_min) || 0));
    const hours = Math.round((workedMin / 60) * 100) / 100;

    // Resolve multiplier: prefer the explicit roster -> duty link.
    // Fall back to date match. Default 1x.
    const shiftDate = toZonedISO(new Date(ds.shift_end), tenantTz);
    const multiplier =
      multiplierByDuty.get(ds.id) ||
      multiplierByDate.get(shiftDate) ||
      1;

    const baseHours = Math.min(hours, overtimeAfter);
    const otHours = Math.max(0, hours - overtimeAfter);

    const basePay = Math.round(baseHours * hourlyRate * 100) / 100;
    const otPay = Math.round(otHours * hourlyRate * OT_RATE_MULTIPLIER * 100) / 100;
    // Premium ON TOP of base pay (e.g. 2x Sunday adds 1x base pay).
    const multiplierPay = multiplier > 1
      ? Math.round(hours * hourlyRate * (multiplier - 1) * 100) / 100
      : 0;

    shifts.push({
      shift_id: ds.id,
      shift_date: shiftDate,
      hours,
      rate_multiplier: multiplier,
      base_hours: baseHours,
      ot_hours: otHours,
      base_pay: basePay,
      ot_pay: otPay,
      multiplier_pay: multiplierPay,
      line_total: Math.round((basePay + otPay + multiplierPay) * 100) / 100,
    });
  }

  const totalHours = Math.round(shifts.reduce((s, r) => s + r.hours, 0) * 100) / 100;
  const hourlyBasePay = Math.round(shifts.reduce((s, r) => s + r.base_pay, 0) * 100) / 100;
  const hourlyOvertimePay = Math.round(shifts.reduce((s, r) => s + r.ot_pay, 0) * 100) / 100;
  const hourlyMultiplierPay = Math.round(shifts.reduce((s, r) => s + r.multiplier_pay, 0) * 100) / 100;

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
    multiplierPay = 0;
  } else if (payType === "shift") {
    // Roster count when available (matches the wage report); fall back
    // to the duty-clock actual count for staff clocked only on the
    // tablet with no roster rows.
    basePay = computeShiftPeriodPay(shiftRate, rosterShiftCount ?? shifts.length);
    overtimePay = 0;
    multiplierPay = 0;
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
