/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kitchen staff service: the people-and-clock layer for the kitchen tablet.
 *
 * Phase 5 model:
 *   - Kitchen runs off ONE login per company (the tablet on the wall).
 *   - Every staff member is a `kitchen_staff_members` row, NOT an auth user.
 *   - The board lists all active staff as tiles. Tap = clock in. Tap again
 *     = clock out. Long-press / pencil = manual override (back-date or fix
 *     a missed clock-out).
 *   - Each shift is split into `standard_min` and `overtime_min` at
 *     clock-out using the staff member's daily threshold (default 9h).
 *
 * Two views of the same row:
 *   - Kitchen surface: name + on-duty + live timer + hours. NO rates.
 *   - Owner surface: same plus hourly_rate / overtime_rate / wage rollup.
 *
 * RLS on the table allows any company member to read names + shifts; only
 * owner / admin / super_admin can mutate the staff table itself. Rates live
 * on the same row -- the kitchen surface simply never selects those columns.
 */
import { supabase } from "@/integrations/supabase/client";

// ── Types ───────────────────────────────────────────────────────────────────

export interface KitchenStaffMember {
  id: string;
  company_id: string;
  full_name: string;
  role_title: string | null;
  phone: string | null;
  email: string | null;
  // Rate fields -- only fetched on the owner surface.
  hourly_rate: number | null;
  overtime_rate: number | null;
  standard_hours_per_day: number;
  is_active: boolean;
  linked_profile_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Public view of a staff member -- what the kitchen tablet sees. */
export type KitchenStaffPublic = Omit<
  KitchenStaffMember,
  "hourly_rate" | "overtime_rate" | "standard_hours_per_day"
>;

export interface KitchenShift {
  id: string;
  company_id: string;
  staff_member_id: string;
  shift_start: string;
  shift_end: string | null;
  break_started_at: string | null;
  total_break_min: number;
  standard_min: number | null;
  overtime_min: number | null;
  clocked_in_by: string | null;
  clocked_out_by: string | null;
  manual_override: boolean;
  override_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Roll-up shape for the owner wage dashboard. Hours and minutes mirrored so
 * the UI can show "8h 15m" without re-doing the math in the component.
 */
export interface StaffWageSummary {
  staff_id: string;
  full_name: string;
  role_title: string | null;
  hourly_rate: number | null;
  overtime_rate: number | null;
  shifts_count: number;
  standard_min: number;
  overtime_min: number;
  break_min: number;
  total_min: number;
  standard_wage: number;
  overtime_wage: number;
  total_wage: number;
  open_shift: boolean; // true if a shift is currently in progress
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Effective overtime rate: explicit override, otherwise hourly_rate × 1.5
 * (SA BCEA default). Null in, null out -- the wage column stays empty until
 * the owner sets a rate.
 */
export function effectiveOvertimeRate(staff: { hourly_rate: number | null; overtime_rate: number | null }): number | null {
  if (staff.overtime_rate != null) return Number(staff.overtime_rate);
  if (staff.hourly_rate != null) return Number(staff.hourly_rate) * 1.5;
  return null;
}

/**
 * Split worked minutes into standard / overtime based on a daily threshold.
 * Pure -- used at clock-out and again at the owner roll-up.
 */
export function splitStandardOvertime(workedMin: number, standardHoursPerDay: number): { standard_min: number; overtime_min: number } {
  const cap = Math.max(0, Math.round(standardHoursPerDay * 60));
  const standard_min = Math.min(workedMin, cap);
  const overtime_min = Math.max(0, workedMin - cap);
  return { standard_min, overtime_min };
}

/** Current worked minutes on an in-progress shift, accounting for any open break. */
export function liveWorkedMinutes(shift: { shift_start: string; break_started_at: string | null; total_break_min: number }, now: Date = new Date()): number {
  const start = new Date(shift.shift_start).getTime();
  const grossMin = Math.max(0, Math.floor((now.getTime() - start) / 60_000));
  const onBreakMin = shift.break_started_at
    ? Math.max(0, Math.floor((now.getTime() - new Date(shift.break_started_at).getTime()) / 60_000))
    : 0;
  return Math.max(0, grossMin - shift.total_break_min - onBreakMin);
}

// ── Service ─────────────────────────────────────────────────────────────────

export const kitchenStaffService = {
  // ── Staff records (owner manages, kitchen reads) ─────────────────────────

  /**
   * Owner view -- pulls every column including rates. Used by the admin
   * Staff & Rates page and the wage dashboard.
   */
  async listStaffWithRates(companyId: string, includeArchived = false): Promise<KitchenStaffMember[]> {
    let q = supabase
      .from("kitchen_staff_members")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("full_name", { ascending: true });
    if (!includeArchived) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) {
      console.error("listStaffWithRates failed:", error);
      return [];
    }
    return (data || []) as KitchenStaffMember[];
  },

  /**
   * Kitchen view -- explicitly omits rate columns so they never enter the
   * client bundle. Used by the tablet board.
   */
  async listStaffPublic(companyId: string): Promise<KitchenStaffPublic[]> {
    const { data, error } = await supabase
      .from("kitchen_staff_members")
      .select(
        "id, company_id, full_name, role_title, phone, email, is_active, linked_profile_id, notes, created_at, updated_at, deleted_at"
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name", { ascending: true });
    if (error) {
      console.error("listStaffPublic failed:", error);
      return [];
    }
    return (data || []) as KitchenStaffPublic[];
  },

  async upsertStaff(payload: Partial<KitchenStaffMember> & { company_id: string; full_name: string }): Promise<KitchenStaffMember | null> {
    const { data, error } = await supabase
      .from("kitchen_staff_members")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) {
      console.error("upsertStaff failed:", error);
      throw error;
    }
    return data as KitchenStaffMember;
  },

  /** Soft-archive: flips is_active off and stamps deleted_at. */
  async archiveStaff(id: string): Promise<void> {
    const { error } = await supabase
      .from("kitchen_staff_members")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  // ── Shifts ───────────────────────────────────────────────────────────────

  /** All currently-open shifts (shift_end NULL) for the company. */
  async listOpenShifts(companyId: string): Promise<KitchenShift[]> {
    const { data, error } = await supabase
      .from("kitchen_staff_shifts")
      .select("*")
      .eq("company_id", companyId)
      .is("shift_end", null)
      .is("deleted_at", null)
      .order("shift_start", { ascending: true });
    if (error) {
      console.error("listOpenShifts failed:", error);
      return [];
    }
    return (data || []) as KitchenShift[];
  },

  /** Closed shifts within a window -- feeds the wage roll-up. */
  async listShiftsInRange(companyId: string, fromISO: string, toISO: string): Promise<KitchenShift[]> {
    const { data, error } = await supabase
      .from("kitchen_staff_shifts")
      .select("*")
      .eq("company_id", companyId)
      .gte("shift_start", fromISO)
      .lt("shift_start", toISO)
      .is("deleted_at", null)
      .order("shift_start", { ascending: false });
    if (error) {
      console.error("listShiftsInRange failed:", error);
      return [];
    }
    return (data || []) as KitchenShift[];
  },

  /**
   * Clock the staff member in. Refuses if there's already an open shift --
   * caller should handle the conflict (usually by closing the old one).
   * `manualOverride` lets the owner back-date a clock-in.
   */
  async clockIn(args: {
    companyId: string;
    staffMemberId: string;
    clockedInBy: string | null;
    overrideStartAt?: string;
    manualOverride?: boolean;
    overrideReason?: string;
  }): Promise<KitchenShift> {
    // Defensive check -- RLS won't catch a duplicate open shift since both
    // are valid rows. The kitchen UI relies on this.
    const { data: existing } = await supabase
      .from("kitchen_staff_shifts")
      .select("id")
      .eq("company_id", args.companyId)
      .eq("staff_member_id", args.staffMemberId)
      .is("shift_end", null)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      throw new Error("Staff member is already clocked in");
    }

    const payload = {
      company_id: args.companyId,
      staff_member_id: args.staffMemberId,
      shift_start: args.overrideStartAt || new Date().toISOString(),
      clocked_in_by: args.clockedInBy,
      manual_override: !!args.manualOverride,
      override_reason: args.manualOverride ? args.overrideReason || null : null,
    };
    const { data, error } = await supabase
      .from("kitchen_staff_shifts")
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data as KitchenShift;
  },

  /**
   * Clock out -- closes the shift, computes worked time and splits it into
   * standard / overtime using the staff member's threshold.
   */
  async clockOut(args: {
    shiftId: string;
    clockedOutBy: string | null;
    overrideEndAt?: string;
    extraBreakMin?: number;
    manualOverride?: boolean;
    overrideReason?: string;
    notes?: string;
  }): Promise<KitchenShift> {
    const { data: shift, error: gErr } = await supabase
      .from("kitchen_staff_shifts")
      .select("*, staff:staff_member_id ( standard_hours_per_day )")
      .eq("id", args.shiftId)
      .single();
    if (gErr || !shift) throw gErr || new Error("Shift not found");

    const stdHours = Number((shift as any).staff?.standard_hours_per_day ?? 9);
    const endIso = args.overrideEndAt || new Date().toISOString();
    const endMs = new Date(endIso).getTime();
    const startMs = new Date(shift.shift_start).getTime();
    const grossMin = Math.max(0, Math.floor((endMs - startMs) / 60_000));

    // Close any open break by adding its elapsed time, then add explicit
    // extra-break minutes the closer wants to log.
    const openBreakMin = shift.break_started_at
      ? Math.max(0, Math.floor((endMs - new Date(shift.break_started_at).getTime()) / 60_000))
      : 0;
    const totalBreakMin = (shift.total_break_min || 0) + openBreakMin + (args.extraBreakMin || 0);
    const workedMin = Math.max(0, grossMin - totalBreakMin);
    const { standard_min, overtime_min } = splitStandardOvertime(workedMin, stdHours);

    const patch: Record<string, unknown> = {
      shift_end: endIso,
      total_break_min: totalBreakMin,
      break_started_at: null,
      standard_min,
      overtime_min,
      clocked_out_by: args.clockedOutBy,
    };
    if (args.manualOverride) {
      patch.manual_override = true;
      patch.override_reason = args.overrideReason || null;
    }
    if (args.notes) patch.notes = args.notes;

    const { data, error } = await supabase
      .from("kitchen_staff_shifts")
      .update(patch)
      .eq("id", args.shiftId)
      .select()
      .single();
    if (error) throw error;
    return data as KitchenShift;
  },

  /** Toggle break on an open shift. */
  async toggleBreak(shiftId: string): Promise<void> {
    const { data: shift, error: gErr } = await supabase
      .from("kitchen_staff_shifts")
      .select("break_started_at, total_break_min")
      .eq("id", shiftId)
      .single();
    if (gErr || !shift) throw gErr || new Error("Shift not found");

    if (shift.break_started_at) {
      const elapsedMin = Math.max(0, Math.floor((Date.now() - new Date(shift.break_started_at).getTime()) / 60_000));
      const { error } = await supabase
        .from("kitchen_staff_shifts")
        .update({
          break_started_at: null,
          total_break_min: (shift.total_break_min || 0) + elapsedMin,
        })
        .eq("id", shiftId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("kitchen_staff_shifts")
        .update({ break_started_at: new Date().toISOString() })
        .eq("id", shiftId);
      if (error) throw error;
    }
  },

  /**
   * Manual override edit -- owner can adjust shift_start, shift_end, breaks
   * after the fact (missed clock-out, forgot to clock in). Recomputes the
   * standard / overtime split if the shift is closed.
   */
  async manualEditShift(args: {
    shiftId: string;
    shift_start?: string;
    shift_end?: string | null;
    total_break_min?: number;
    notes?: string;
    override_reason: string;
    edited_by: string | null;
  }): Promise<KitchenShift> {
    const { data: shift, error: gErr } = await supabase
      .from("kitchen_staff_shifts")
      .select("*, staff:staff_member_id ( standard_hours_per_day )")
      .eq("id", args.shiftId)
      .single();
    if (gErr || !shift) throw gErr || new Error("Shift not found");

    const stdHours = Number((shift as any).staff?.standard_hours_per_day ?? 9);
    const newStart = args.shift_start ?? shift.shift_start;
    const newEnd = args.shift_end !== undefined ? args.shift_end : shift.shift_end;
    const newBreakMin = args.total_break_min !== undefined ? args.total_break_min : shift.total_break_min;

    const patch: Record<string, unknown> = {
      shift_start: newStart,
      shift_end: newEnd,
      total_break_min: newBreakMin,
      manual_override: true,
      override_reason: args.override_reason,
      clocked_out_by: args.edited_by,
    };
    if (args.notes !== undefined) patch.notes = args.notes;

    if (newEnd) {
      const grossMin = Math.max(0, Math.floor((new Date(newEnd).getTime() - new Date(newStart).getTime()) / 60_000));
      const workedMin = Math.max(0, grossMin - newBreakMin);
      const split = splitStandardOvertime(workedMin, stdHours);
      patch.standard_min = split.standard_min;
      patch.overtime_min = split.overtime_min;
    } else {
      patch.standard_min = null;
      patch.overtime_min = null;
    }

    const { data, error } = await supabase
      .from("kitchen_staff_shifts")
      .update(patch)
      .eq("id", args.shiftId)
      .select()
      .single();
    if (error) throw error;
    return data as KitchenShift;
  },

  // ── Wage rollup (owner only) ─────────────────────────────────────────────

  /**
   * Per-staff hours + wages over a window. Closed shifts contribute to the
   * standard/overtime split using the values stamped at clock-out; open
   * shifts surface as `open_shift: true` but contribute zero wage so live
   * estimates don't overstate the bill.
   */
  async getWageSummary(companyId: string, fromISO: string, toISO: string): Promise<StaffWageSummary[]> {
    const [staff, shifts] = await Promise.all([
      this.listStaffWithRates(companyId, /* includeArchived */ true),
      this.listShiftsInRange(companyId, fromISO, toISO),
    ]);
    const staffMap = new Map(staff.map(s => [s.id, s]));

    const buckets = new Map<string, StaffWageSummary>();
    const seedFor = (id: string): StaffWageSummary => {
      const s = staffMap.get(id);
      return {
        staff_id: id,
        full_name: s?.full_name || "Unknown",
        role_title: s?.role_title || null,
        hourly_rate: s ? Number(s.hourly_rate ?? 0) || null : null,
        overtime_rate: s ? effectiveOvertimeRate(s) : null,
        shifts_count: 0,
        standard_min: 0,
        overtime_min: 0,
        break_min: 0,
        total_min: 0,
        standard_wage: 0,
        overtime_wage: 0,
        total_wage: 0,
        open_shift: false,
      };
    };

    for (const sh of shifts) {
      const b = buckets.get(sh.staff_member_id) || seedFor(sh.staff_member_id);
      b.shifts_count += 1;
      b.break_min += sh.total_break_min || 0;
      if (sh.shift_end) {
        b.standard_min += sh.standard_min || 0;
        b.overtime_min += sh.overtime_min || 0;
      } else {
        b.open_shift = true;
      }
      b.total_min = b.standard_min + b.overtime_min;
      buckets.set(sh.staff_member_id, b);
    }

    // Wage math runs once at the end so we don't recompute per shift.
    for (const b of buckets.values()) {
      const hr = b.hourly_rate;
      const otHr = b.overtime_rate;
      b.standard_wage = hr ? Math.round((b.standard_min / 60) * hr * 100) / 100 : 0;
      b.overtime_wage = otHr ? Math.round((b.overtime_min / 60) * otHr * 100) / 100 : 0;
      b.total_wage = Math.round((b.standard_wage + b.overtime_wage) * 100) / 100;
    }

    return Array.from(buckets.values()).sort((a, b) => b.total_wage - a.total_wage || a.full_name.localeCompare(b.full_name));
  },
};
