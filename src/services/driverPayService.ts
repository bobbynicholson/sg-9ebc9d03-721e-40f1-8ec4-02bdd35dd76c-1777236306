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
   *
   * Returns a flat shape (`{ ok, shift?, error? }`) rather than a
   * discriminated union -- TS narrowing across the module boundary
   * can't track the union into the consumer's reachability check, so
   * `if (!result.ok) throw new Error(result.error)` fails the
   * compiler. Flat is plain.
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
  ): Promise<{ ok: boolean; shift?: DriverShift; error?: string }> {
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
    // Prefer the rate-locked snapshot when present (stamped on
    // delivery completion via autoClockOut). Falls back to a live
    // calc for legacy orders that closed before snapshotting shipped.
    const deliveryLines = orders.map((o) => {
      if (o.locked_total != null) {
        return {
          order_id: o.id,
          distance_km: Number(o.delivery_distance_km || 0),
          // Snapshot doesn't keep the per-km rate; synthesise it
          // from the stored values so the UI can still show /km.
          distance_rate: o.delivery_distance_km && o.locked_distance_fee != null && Number(o.delivery_distance_km) > 0
            ? +(Number(o.locked_distance_fee) / Number(o.delivery_distance_km)).toFixed(2)
            : rates.distance_rate_per_km,
          distance_pay: +Number(o.locked_distance_fee || 0).toFixed(2),
          callout_fee: +Number(o.locked_base_fee || 0).toFixed(2),
          total: +Number(o.locked_total || 0).toFixed(2),
        };
      }
      return calculateDeliveryPay(o, rates);
    });

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
   * Auto clock-in -- called from the dispatch flow when a driver
   * marks an order as picked up. Idempotent: if an open shift
   * already exists for this driver + order, do nothing.
   *
   * Stage 4 wiring point. The shift gets:
   *   source     = 'auto'
   *   status     = 'active'
   *   actual_start = now
   *   order_id   = the picked-up order
   * The matching auto clock-out closes it.
   */
  async autoClockIn(
    opts: { companyId: string; driverId: string; orderId: string },
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; shiftId?: string | null; error?: string }> {
    try {
      // Check for an existing open shift on this order. Avoids dupe
      // rows when the driver hits "picked up" twice or the API
      // double-fires.
      const { data: existing } = await (client as any)
        .from("driver_shifts")
        .select("id")
        .eq("company_id", opts.companyId)
        .eq("driver_id", opts.driverId)
        .eq("order_id", opts.orderId)
        .is("actual_end", null)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) return { ok: true, shiftId: (existing as any).id };

      const nowIso = new Date().toISOString();
      const { data, error } = await (client as any)
        .from("driver_shifts")
        .insert({
          company_id: opts.companyId,
          driver_id: opts.driverId,
          shift_date: nowIso.slice(0, 10),
          actual_start: nowIso,
          status: "active",
          source: "auto",
          order_id: opts.orderId,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, shiftId: (data as any).id };
    } catch (e: any) {
      return { ok: false, error: e?.message || "autoClockIn failed" };
    }
  },

  /**
   * Auto clock-out -- called when an order transitions to delivered.
   * Closes the open auto-shift for this order, computes BCEA
   * rate_multiplier based on the day of week + public_holidays
   * table.
   *
   * BCEA s16: ordinary work on Sundays + public holidays = 2x.
   * Anything else = 1x (NULL in our schema, treated as 1 by the
   * pay calc).
   */
  async autoClockOut(
    opts: { companyId: string; driverId: string; orderId: string },
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const { data: openShift } = await (client as any)
        .from("driver_shifts")
        .select("id, actual_start")
        .eq("company_id", opts.companyId)
        .eq("driver_id", opts.driverId)
        .eq("order_id", opts.orderId)
        .is("actual_end", null)
        .is("deleted_at", null)
        .maybeSingle();
      if (!openShift) return { ok: true }; // nothing to close, fine

      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);
      const isSunday = new Date(nowIso).getDay() === 0;

      // Public holiday lookup -- match either a one-off date for this
      // company OR a recurring one (matched on month-day, year-agnostic).
      let isHoliday = false;
      const { data: oneOffs } = await (client as any)
        .from("public_holidays")
        .select("date, is_recurring")
        .eq("company_id", opts.companyId)
        .eq("date", today)
        .limit(1);
      if (oneOffs && (oneOffs as any[]).length > 0) {
        isHoliday = true;
      } else {
        // Recurring: we stored the original date but the holiday
        // recurs annually -- match month + day.
        const md = today.slice(5); // 'MM-DD'
        const { data: recurring } = await (client as any)
          .from("public_holidays")
          .select("date")
          .eq("company_id", opts.companyId)
          .eq("is_recurring", true);
        if (recurring) {
          for (const r of recurring as Array<{ date: string }>) {
            if (r.date && r.date.slice(5) === md) { isHoliday = true; break; }
          }
        }
      }

      const multiplier = (isSunday || isHoliday) ? 2 : null;

      // Compute hours_worked here. The previous code persisted only
      // actual_end + status, leaving hours_worked NULL forever, which
      // made every auto-tracked shift invisible to getPaySummary
      // (filters where hours_worked != null) AND made calculateShiftPay
      // return R0 (Number(shift.hours_worked || 0)). Net effect: drivers
      // earned R0 on the hourly portion of every auto-tracked delivery.
      // The split-on-midnight Sunday/holiday miscalculation is a
      // separate Phase 2 fix; this populates the column correctly for
      // single-day shifts which is the common case.
      const startMs = (openShift as any).actual_start
        ? new Date((openShift as any).actual_start).getTime()
        : NaN;
      const endMs = new Date(nowIso).getTime();
      const hoursWorked = Number.isFinite(startMs) && endMs > startMs
        ? Number(((endMs - startMs) / 3_600_000).toFixed(4))
        : null;

      const { error } = await (client as any)
        .from("driver_shifts")
        .update({
          actual_end: nowIso,
          status: "completed",
          rate_multiplier: multiplier,
          hours_worked: hoursWorked,
        })
        .eq("id", (openShift as any).id);
      if (error) return { ok: false, error: error.message };

      // Rate-locking. Snapshot the distance + callout pay onto
      // driver_assignments now that the delivery is closing. Once
      // stamped, getPaySummary prefers these values over the live
      // calc -- so changing a driver's rates next week doesn't
      // retroactively shift this delivery's pay.
      try {
        await snapshotDriverAssignmentForOrder(client, opts);
      } catch (snapshotErr) {
        // Snapshot is bookkeeping; never block the clock-out on it.
        console.warn("[autoClockOut] snapshot failed (non-fatal):", snapshotErr);
      }

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "autoClockOut failed" };
    }
  },

  /**
   * Internal: deliveries this driver completed in the range. Uses
   * orders.assigned_driver_id + status='delivered' (the existing
   * source of truth). delivery_distance_km already lives on orders.
   *
   * Returns shape includes optional locked snapshot from
   * driver_assignments. When `locked_total` is set, the calc layer
   * uses the snapshot instead of recomputing, so old deliveries
   * don't shift when a driver's rates change going forward.
   */
  async _listCompletedDeliveries(
    opts: { companyId: string; driverId: string; range: DateRange },
    client: Sb = defaultClient,
  ): Promise<Array<{
    id: string;
    delivery_distance_km: number | null;
    locked_distance_fee?: number | null;
    locked_base_fee?: number | null;
    locked_total?: number | null;
  }>> {
    // Pull orders + assignment snapshot in parallel. The join goes
    // through driver_assignments by (order_id, driver_id) so each
    // order gets its own snapshot, even if the same order was
    // re-assigned to another driver later.
    const { data: orderRows, error: orderErr } = await (client as any)
      .from("orders")
      .select("id, delivery_distance_km")
      .eq("company_id", opts.companyId)
      .eq("assigned_driver_id", opts.driverId)
      .is("deleted_at", null)
      .eq("status", "delivered")
      .gte("event_date", opts.range.from)
      .lte("event_date", opts.range.to);
    if (orderErr) {
      console.warn("[driverPayService._listCompletedDeliveries]", orderErr);
      return [];
    }
    const orders = (orderRows || []) as Array<{ id: string; delivery_distance_km: number | null }>;
    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);
    const { data: assignmentRows } = await (client as any)
      .from("driver_assignments")
      .select("order_id, base_fee, distance_fee, total_earnings")
      .eq("driver_id", opts.driverId)
      .in("order_id", orderIds);
    const lockedByOrder = new Map<string, { base: number | null; distance: number | null; total: number | null }>();
    for (const a of (assignmentRows || []) as Array<{
      order_id: string;
      base_fee: number | null;
      distance_fee: number | null;
      total_earnings: number | null;
    }>) {
      lockedByOrder.set(a.order_id, {
        base: a.base_fee,
        distance: a.distance_fee,
        total: a.total_earnings,
      });
    }

    return orders.map((o) => {
      const locked = lockedByOrder.get(o.id);
      return {
        id: o.id,
        delivery_distance_km: o.delivery_distance_km,
        locked_distance_fee: locked?.distance ?? null,
        locked_base_fee: locked?.base ?? null,
        locked_total: locked?.total ?? null,
      };
    });
  },
};

/**
 * Snapshot the calculated distance + callout pay onto
 * driver_assignments for a given (driver, order). Idempotent: looks
 * for an existing assignment row first, updates it; if absent,
 * inserts a fresh one.
 *
 * Called from autoClockOut on delivery completion so the values get
 * locked at the rates in force at that moment. Future getPaySummary
 * calls prefer these locked values over the live calc.
 */
async function snapshotDriverAssignmentForOrder(
  client: Sb,
  opts: { companyId: string; driverId: string; orderId: string },
): Promise<void> {
  // Pull the order's distance + the driver's effective rates.
  const { data: orderRow } = await (client as any)
    .from("orders")
    .select("id, delivery_distance_km")
    .eq("id", opts.orderId)
    .maybeSingle();
  if (!orderRow) return;

  const [defaults, profile] = await Promise.all([
    driverPayService.getCompanyDefaults(opts.companyId, client),
    driverPayService.getDriverProfile(opts.driverId, client),
  ]);
  const rates = resolveEffectiveRates(profile, defaults);
  const line = calculateDeliveryPay(
    { id: opts.orderId, delivery_distance_km: (orderRow as any).delivery_distance_km },
    rates,
  );

  // Upsert by (order_id, driver_id). driver_assignments has no
  // composite unique constraint we can rely on across all tenants,
  // so do a check-then-write: safer with mixed-history rows.
  const { data: existing } = await (client as any)
    .from("driver_assignments")
    .select("id")
    .eq("order_id", opts.orderId)
    .eq("driver_id", opts.driverId)
    .maybeSingle();

  const payload = {
    base_fee: line.callout_fee,
    distance_fee: line.distance_pay,
    total_earnings: line.total,
    calculated_distance: line.distance_km,
    delivered_at: new Date().toISOString(),
  };

  if (existing) {
    await (client as any)
      .from("driver_assignments")
      .update(payload)
      .eq("id", (existing as any).id);
  } else {
    await (client as any)
      .from("driver_assignments")
      .insert({
        company_id: opts.companyId,
        driver_id: opts.driverId,
        order_id: opts.orderId,
        status: "completed",
        ...payload,
      });
  }
}
