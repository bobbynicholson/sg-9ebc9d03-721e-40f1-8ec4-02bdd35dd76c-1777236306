/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * driverPayService -- the single source of truth for "what does this
 * driver get paid?".
 *
 * Three pay components combine into a driver's total earnings:
 *
 *   1. Hourly  -- on-shift hours (from driver_shifts.hours_worked)
 *                 multiplied by the driver's effective hourly rate.
 *                 BCEA rate_multiplier applied if set (Stage 4
 *                 stamps 2x for Sundays + public holidays).
 *   2. Distance-- delivery_distance_km from the order multiplied by
 *                 the driver's effective per-km rate.
 *   3. Callout -- a flat fee per delivery the driver was dispatched
 *                 to. Effective fee per driver / company default.
 *
 * "Effective" rate = driver-specific override (profiles.hourly_rate
 * etc.) when set, otherwise the company default
 * (companies.default_driver_hourly_rate etc.). Caller passes a single
 * resolveEffectiveRates() result; nothing here re-fetches.
 *
 * Stage 2 surface: read shifts, write manual shifts, compute pay for
 * a driver across a date range. Stage 3 will hook this into delivery
 * completion to stamp driver_assignments.base_fee / distance_fee /
 * total_earnings.
 */
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any> | any;

export interface DriverPayRates {
  hourly_rate: number;          // ZAR per hour
  distance_rate_per_km: number; // ZAR per km
  base_callout_fee: number;     // ZAR flat per dispatch
}

export interface DriverPayProfile {
  hourly_rate?: number | null;
  distance_rate_per_km?: number | null;
  base_callout_fee?: number | null;
}

export interface CompanyPayDefaults {
  default_driver_hourly_rate?: number | null;
  default_distance_rate_per_km?: number | null;
  default_base_callout_fee?: number | null;
}

export interface DriverShift {
  id: string;
  company_id: string;
  driver_id: string;
  shift_date: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: "scheduled" | "active" | "completed" | "missed" | "cancelled";
  source: "manual" | "auto";
  order_id: string | null;
  notes: string | null;
  rate_multiplier: number | null;
  hours_worked: number | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ShiftPayLine {
  shift_id: string;
  hours: number;
  multiplier: number;
  hourly_rate: number;
  pay: number;
}

export interface DeliveryPayLine {
  order_id: string;
  distance_km: number;
  distance_rate: number;
  distance_pay: number;
  callout_fee: number;
  total: number;
}

export interface DriverPaySummary {
  rates: DriverPayRates;
  shifts: ShiftPayLine[];
  deliveries: DeliveryPayLine[];
  totals: {
    hours_total: number;
    hourly_pay: number;
    distance_total_km: number;
    distance_pay: number;
    callout_pay: number;
    grand_total: number;
  };
}

/**
 * Merge per-driver overrides over company defaults. Anything still
 * unset becomes 0 -- the operator hasn't told us a rate, so don't
 * invent one. The downstream pay sum just stays low instead of
 * silently using a fabricated default.
 */
export function resolveEffectiveRates(
  driver: DriverPayProfile | null | undefined,
  companyDefaults: CompanyPayDefaults | null | undefined,
): DriverPayRates {
  const num = (v: any): number => {
    if (v == null) return 0;
    const n = Number(v);
    return isNaN(n) || n < 0 ? 0 : n;
  };
  return {
    hourly_rate:
      num(driver?.hourly_rate) ||
      num(companyDefaults?.default_driver_hourly_rate),
    distance_rate_per_km:
      num(driver?.distance_rate_per_km) ||
      num(companyDefaults?.default_distance_rate_per_km),
    base_callout_fee:
      num(driver?.base_callout_fee) ||
      num(companyDefaults?.default_base_callout_fee),
  };
}

/**
 * Compute the pay line for a single completed shift. Multiplier
 * defaults to 1 when NULL (no BCEA bump).
 */
export function calculateShiftPay(
  shift: Pick<DriverShift, "id" | "hours_worked" | "rate_multiplier">,
  rates: DriverPayRates,
): ShiftPayLine {
  const hours = Number(shift.hours_worked || 0);
  const multiplier = Number(shift.rate_multiplier || 1);
  const pay = +(hours * multiplier * rates.hourly_rate).toFixed(2);
  return {
    shift_id: shift.id,
    hours: +hours.toFixed(2),
    multiplier: +multiplier.toFixed(2),
    hourly_rate: rates.hourly_rate,
    pay,
  };
}

/**
 * Compute the pay line for a single delivery. Reads
 * delivery_distance_km off the order (already snapshot at quote /
 * order time) and adds the flat callout fee on top.
 */
export function calculateDeliveryPay(
  order: { id: string; delivery_distance_km?: number | null },
  rates: DriverPayRates,
): DeliveryPayLine {
  const distance = Number(order.delivery_distance_km || 0);
  const distancePay = +(distance * rates.distance_rate_per_km).toFixed(2);
  const callout = +rates.base_callout_fee.toFixed(2);
  return {
    order_id: order.id,
    distance_km: +distance.toFixed(2),
    distance_rate: rates.distance_rate_per_km,
    distance_pay: distancePay,
    callout_fee: callout,
    total: +(distancePay + callout).toFixed(2),
  };
}

export interface DateRange {
  /** ISO date string (inclusive). */
  from: string;
  /** ISO date string (inclusive). */
  to: string;
}

export const driverPayService = {
  /** Fetch the company-wide pay defaults in one round trip. */
  async getCompanyDefaults(
    companyId: string,
    client: Sb = defaultClient,
  ): Promise<CompanyPayDefaults> {
    const { data, error } = await (client as any)
      .from("companies")
      .select("default_driver_hourly_rate, default_distance_rate_per_km, default_base_callout_fee")
      .eq("id", companyId)
      .maybeSingle();
    if (error) {
      console.warn("[driverPayService.getCompanyDefaults]", error);
      return {};
    }
    return (data || {}) as CompanyPayDefaults;
  },

  /** Driver row with the rate columns we care about. */
  async getDriverProfile(
    driverId: string,
    client: Sb = defaultClient,
  ): Promise<DriverPayProfile | null> {
    const { data, error } = await (client as any)
      .from("profiles")
      .select("hourly_rate, distance_rate_per_km, base_callout_fee")
      .eq("id", driverId)
      .maybeSingle();
    if (error) {
      console.warn("[driverPayService.getDriverProfile]", error);
      return null;
    }
    return (data || null) as DriverPayProfile | null;
  },

  /** List shifts for a driver, optionally filtered by date range. */
  async listShifts(
    opts: { companyId: string; driverId: string; range?: DateRange },
    client: Sb = defaultClient,
  ): Promise<DriverShift[]> {
    let q = (client as any)
      .from("driver_shifts")
      .select("*")
      .eq("company_id", opts.companyId)
      .eq("driver_id", opts.driverId)
      .is("deleted_at", null)
      .order("actual_start", { ascending: false, nullsFirst: false });
    if (opts.range) {
      q = q.gte("shift_date", opts.range.from).lte("shift_date", opts.range.to);
    }
    const { data, error } = await q;
    if (error) {
      console.warn("[driverPayService.listShifts]", error);
      return [];
    }
    return (data || []) as DriverShift[];
  },

  /**
   * Manual shift entry from the admin UI. Required: company_id,
   * driver_id, actual_start, actual_end. All else optional.
   */
  async createManualShift(
    payload: {
      company_id: string;
      driver_id: string;
      actual_start: string;     // ISO timestamp
      actual_end: string;       // ISO timestamp
      notes?: string | null;
      created_by_user_id?: string | null;
      rate_multiplier?: number | null;
    },
    client: Sb = defaultClient,
  ): Promise<{ ok: true; shift: DriverShift } | { ok: false; error: string }> {
    const start = new Date(payload.actual_start);
    const end = new Date(payload.actual_end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { ok: false, error: "Invalid clock-in or clock-out time" };
    }
    if (end < start) {
      return { ok: false, error: "Clock-out must be after clock-in" };
    }
    const insertRow: any = {
      company_id: payload.company_id,
      driver_id: payload.driver_id,
      shift_date: payload.actual_start.slice(0, 10),
      actual_start: payload.actual_start,
      actual_end: payload.actual_end,
      status: "completed",
      source: "manual",
      notes: payload.notes ?? null,
      created_by_user_id: payload.created_by_user_id ?? null,
      rate_multiplier: payload.rate_multiplier ?? null,
    };
    const { data, error } = await (client as any)
      .from("driver_shifts")
      .insert(insertRow)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, shift: data as DriverShift };
  },

  async updateShift(
    id: string,
    patch: Partial<Pick<DriverShift, "actual_start" | "actual_end" | "notes" | "rate_multiplier" | "status">>,
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; error?: string }> {
    const { error } = await (client as any)
      .from("driver_shifts")
      .update(patch)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  /** Soft delete -- preserves historical shifts in reports. */
  async deleteShift(
    id: string,
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; error?: string }> {
    const { error } = await (client as any)
      .from("driver_shifts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  /**
   * Compute the full pay summary for a driver across a date range.
   * One round trip per source: shifts (hourly), orders (distance +
   * callout). Aggregates client-side because the row counts in a
   * fortnight or month are small.
   */
  async getPaySummary(
    opts: { companyId: string; driverId: string; range: DateRange },
    client: Sb = defaultClient,
  ): Promise<DriverPaySummary> {
    const [defaults, profile, shifts, orders] = await Promise.all([
      this.getCompanyDefaults(opts.companyId, client),
      this.getDriverProfile(opts.driverId, client),
      this.listShifts({ ...opts, range: opts.range }, client),
      this._listCompletedDeliveries(opts, client),
    ]);
    const rates = resolveEffectiveRates(profile, defaults);

    const shiftLines = shifts
      .filter((s) => s.status === "completed" && s.hours_worked != null)
      .map((s) => calculateShiftPay(s, rates));
    const deliveryLines = orders.map((o) => calculateDeliveryPay(o, rates));

    const hoursTotal = +shiftLines.reduce((sum, s) => sum + s.hours, 0).toFixed(2);
    const hourlyPay = +shiftLines.reduce((sum, s) => sum + s.pay, 0).toFixed(2);
    const distanceTotalKm = +deliveryLines.reduce((sum, d) => sum + d.distance_km, 0).toFixed(2);
    const distancePay = +deliveryLines.reduce((sum, d) => sum + d.distance_pay, 0).toFixed(2);
    const calloutPay = +deliveryLines.reduce((sum, d) => sum + d.callout_fee, 0).toFixed(2);

    return {
      rates,
      shifts: shiftLines,
      deliveries: deliveryLines,
      totals: {
        hours_total: hoursTotal,
        hourly_pay: hourlyPay,
        distance_total_km: distanceTotalKm,
        distance_pay: distancePay,
        callout_pay: calloutPay,
        grand_total: +(hourlyPay + distancePay + calloutPay).toFixed(2),
      },
    };
  },

  /**
   * Internal: deliveries this driver completed in the range. Uses
   * orders.assigned_driver_id + status='delivered' (the existing
   * source of truth). delivery_distance_km already lives on orders.
   */
  async _listCompletedDeliveries(
    opts: { companyId: string; driverId: string; range: DateRange },
    client: Sb = defaultClient,
  ): Promise<Array<{ id: string; delivery_distance_km: number | null }>> {
    const { data, error } = await (client as any)
      .from("orders")
      .select("id, delivery_distance_km")
      .eq("company_id", opts.companyId)
      .eq("assigned_driver_id", opts.driverId)
      .is("deleted_at", null)
      .eq("status", "delivered")
      .gte("event_date", opts.range.from)
      .lte("event_date", opts.range.to);
    if (error) {
      console.warn("[driverPayService._listCompletedDeliveries]", error);
      return [];
    }
    return (data || []) as Array<{ id: string; delivery_distance_km: number | null }>;
  },
};
