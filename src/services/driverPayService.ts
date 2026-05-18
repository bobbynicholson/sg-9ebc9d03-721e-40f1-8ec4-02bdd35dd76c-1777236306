/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * driverPayService - the single source of truth for "what does this
 * driver get paid?".
 *
 * Three pay components combine into a driver's total earnings:
 *
 *   1. Hourly  - on-shift hours (from driver_shifts.hours_worked)
 *                 multiplied by the driver's effective hourly rate.
 *                 BCEA rate_multiplier applied if set (Stage 4
 *                 stamps 2x for Sundays + public holidays).
 *   2. Distance-- delivery_distance_km from the order multiplied by
 *                 the driver's effective per-km rate.
 *   3. Callout - a flat fee per delivery the driver was dispatched
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
  /** Phase 3 #2: per-day BCEA buckets when the shift crosses
   *  midnight or includes overtime. NULL on shifts that don't have
   *  actual_start + actual_end timestamps (legacy / manual rows). */
  bcea_buckets?: Array<{
    date: string;
    hours: number;
    dayMultiplier: number;
    overtimeHours: number;
    pay: number;
  }>;
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
 * unset becomes 0 - the operator hasn't told us a rate, so don't
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
 * Phase 2 #9: split a shift that may cross midnight into per-day
 * buckets so each calendar day can carry its own BCEA multiplier.
 * Returns an array of { date: 'YYYY-MM-DD', hours: number }.
 *
 * Used for the Sunday + public-holiday 2x rule (BCEA s16) so a
 * Saturday-night-into-Sunday-morning shift correctly gets paid
 * 1x for the Saturday hours and 2x for the Sunday hours, instead
 * of slapping a single multiplier on the whole shift based on
 * which day actual_end happened to fall on.
 *
 * Pure: doesn't read from anywhere, takes a (start, end) and emits
 * the bucket list. Always uses the local-time day boundary the way
 * the operator running the company experiences it - not UTC. The
 * tenant timezone handling is a future Phase 3 item; for now SAST
 * matches every live tenant.
 */
export function splitShiftIntoDayBuckets(
  startIso: string,
  endIso: string,
): Array<{ date: string; hours: number }> {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (end.getTime() <= start.getTime()) return [];

  const buckets: Array<{ date: string; hours: number }> = [];
  let cursor = new Date(start);
  while (cursor.getTime() < end.getTime()) {
    // Midnight at the end of the current local-time day.
    const dayEnd = new Date(cursor);
    dayEnd.setHours(24, 0, 0, 0);
    const sliceEnd = dayEnd.getTime() < end.getTime() ? dayEnd : end;
    const hours = (sliceEnd.getTime() - cursor.getTime()) / 3_600_000;
    if (hours > 0) {
      // Local-date key 'YYYY-MM-DD'. toLocalISO would also work but
      // we're constraint-free here so do it inline.
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, "0");
      const dd = String(cursor.getDate()).padStart(2, "0");
      buckets.push({ date: `${yyyy}-${mm}-${dd}`, hours: +hours.toFixed(4) });
    }
    cursor = sliceEnd;
  }
  return buckets;
}

/**
 * Phase 2 #9: BCEA-aware pay calc for a shift defined by
 * actual_start + actual_end. Walks per-day buckets and applies:
 *   - 2x for Sundays + public holidays (BCEA s16)
 *   - 1.5x for hours over 9 in any single bucket (BCEA s10 overtime)
 * The 1.5x stacks on top of the day multiplier, e.g. a 10-hour
 * Sunday shift pays 9h at 2x + 1h at 3x (2x * 1.5).
 *
 * holidayDateSet is a Set of 'YYYY-MM-DD' for one-off holidays
 * specific to the year + a Set of 'MM-DD' for recurring annual ones.
 * autoClockOut already builds these from public_holidays; this
 * helper is pure so the caller hands them in.
 */
export interface BceaPayResult {
  totalHours: number;
  pay: number;
  dominantMultiplier: number; // largest multiplier used (for rate_multiplier stamp)
  buckets: Array<{
    date: string;
    hours: number;
    dayMultiplier: number;
    overtimeHours: number;
    pay: number;
  }>;
}

export function calculateBceaShiftPay(
  startIso: string,
  endIso: string,
  hourlyRate: number,
  holidays: { oneOff: Set<string>; recurringMD: Set<string> },
  options: { overtimeThresholdHours?: number; overtimeMultiplier?: number } = {},
): BceaPayResult {
  const overtimeThreshold = options.overtimeThresholdHours ?? 9; // BCEA s10
  const overtimeMultiplier = options.overtimeMultiplier ?? 1.5;
  const buckets = splitShiftIntoDayBuckets(startIso, endIso);
  let pay = 0;
  let totalHours = 0;
  let dominantMultiplier = 1;
  const resultBuckets: BceaPayResult["buckets"] = [];

  for (const b of buckets) {
    const md = b.date.slice(5);
    const dow = new Date(b.date + "T12:00:00").getDay(); // 0 = Sunday
    const isSundayOrPH =
      dow === 0 || holidays.oneOff.has(b.date) || holidays.recurringMD.has(md);
    const dayMul = isSundayOrPH ? 2 : 1;
    const regularHours = Math.min(b.hours, overtimeThreshold);
    const overtimeHours = Math.max(0, b.hours - overtimeThreshold);
    const bucketPay =
      regularHours * dayMul * hourlyRate +
      overtimeHours * dayMul * overtimeMultiplier * hourlyRate;
    pay += bucketPay;
    totalHours += b.hours;
    if (dayMul > dominantMultiplier) dominantMultiplier = dayMul;
    if (overtimeHours > 0 && dayMul * overtimeMultiplier > dominantMultiplier) {
      dominantMultiplier = dayMul * overtimeMultiplier;
    }
    resultBuckets.push({
      date: b.date,
      hours: +b.hours.toFixed(4),
      dayMultiplier: dayMul,
      overtimeHours: +overtimeHours.toFixed(4),
      pay: +bucketPay.toFixed(2),
    });
  }

  return {
    totalHours: +totalHours.toFixed(4),
    pay: +pay.toFixed(2),
    dominantMultiplier: +dominantMultiplier.toFixed(2),
    buckets: resultBuckets,
  };
}

/**
 * Compute the pay line for a single delivery. Reads
 * delivery_distance_km off the order (already snapshot at quote /
 * order time) and adds the flat callout fee on top.
 *
 * delivery_distance_km is stored as the ONE-WAY kitchen-to-venue
 * distance (matches what the operator sees on Google Maps). The
 * Phase 29 client-billing change moved the customer-side fee to
 * round-trip (distance * 2 * rate). Driver pay needs the same ×2
 * because the driver actually drives both legs - otherwise the
 * tenant silently underpays half the kilometres while billing
 * the customer for the lot. distance_km on the receipt also
 * reflects the round-trip total so payslip arithmetic is
 * obvious.
 */
export function calculateDeliveryPay(
  order: { id: string; delivery_distance_km?: number | null },
  rates: DriverPayRates,
): DeliveryPayLine {
  const oneWay = Number(order.delivery_distance_km || 0);
  const billable = oneWay * 2;
  const distancePay = +(billable * rates.distance_rate_per_km).toFixed(2);
  const callout = +rates.base_callout_fee.toFixed(2);
  return {
    order_id: order.id,
    distance_km: +billable.toFixed(2),
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
   * discriminated union - TS narrowing across the module boundary
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
      /** Phase 6 #6: opt-in bypass for the overlap check. Used when
       *  the operator has reviewed the conflict and wants to log
       *  the shift anyway (e.g. two short jobs that share a 5-min
       *  window). Default behaviour refuses the insert. */
      allow_overlap?: boolean;
    },
    client: Sb = defaultClient,
  ): Promise<{
    ok: boolean;
    shift?: DriverShift;
    error?: string;
    conflict?: { id: string; actual_start: string | null; actual_end: string | null };
    /** Phase 7 #2: BCEA fatigue warning. Set when the shift exceeds
     *  12h or the gap to the previous shift is under 12h. The
     *  insert still succeeded; the operator just gets a heads-up
     *  toast on the UI side. */
    fatigueWarning?: string;
  }> {
    const start = new Date(payload.actual_start);
    const end = new Date(payload.actual_end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { ok: false, error: "Invalid clock-in or clock-out time" };
    }
    if (end < start) {
      return { ok: false, error: "Clock-out must be after clock-in" };
    }
    // Phase 6 #6: driver shift overlap check. A driver can't be on
    // two shifts at the same time - it's nonsense for hour
    // tracking and downstream BCEA pay calc would double-count.
    // We refuse the insert unless allow_overlap is set, in which
    // case the operator gets the conflicting shift's id + window
    // back so they can decide whether to merge / extend / split.
    if (!payload.allow_overlap) {
      const { data: overlaps } = await (client as any)
        .from("driver_shifts")
        .select("id, actual_start, actual_end")
        .eq("driver_id", payload.driver_id)
        .is("deleted_at", null)
        .lt("actual_start", payload.actual_end)
        .or(`actual_end.gt.${payload.actual_start},actual_end.is.null`)
        .limit(1);
      if (overlaps && (overlaps as any[]).length > 0) {
        const c = (overlaps as any[])[0];
        return {
          ok: false,
          error:
            "This driver already has a shift that overlaps the window you're trying to log. Resolve the existing one or pass allow_overlap to proceed.",
          conflict: {
            id: c.id,
            actual_start: c.actual_start,
            actual_end: c.actual_end,
          },
        };
      }
    }

    // Phase 7 #2: BCEA s9 fatigue cap. The Act limits ordinary daily
    // hours to 12h with a mandatory 12h consecutive rest break
    // between shifts. We don't refuse the insert (some real
    // operations push past 12h on a one-off basis) but we surface
    // a soft warning the operator must acknowledge. Skipped when
    // allow_overlap is set since the operator already chose to
    // override the related overlap check.
    let fatigueWarning: string | null = null;
    if (!payload.allow_overlap) {
      const startMs = new Date(payload.actual_start).getTime();
      const endMs = new Date(payload.actual_end).getTime();
      const hoursThisShift = (endMs - startMs) / 3_600_000;
      // (a) shift over 12h
      if (hoursThisShift > 12) {
        fatigueWarning = `BCEA cap: this shift is ${hoursThisShift.toFixed(1)}h. Ordinary daily limit is 12h.`;
      } else {
        // (b) less than 12h gap since the last completed shift on
        // the same driver. Pull the most recent closed shift in
        // the 24h before this one.
        const lookbackIso = new Date(startMs - 24 * 3_600_000).toISOString();
        const { data: prior, error: priorErr } = await (client as any)
          .from("driver_shifts")
          .select("actual_end")
          .eq("driver_id", payload.driver_id)
          .is("deleted_at", null)
          .not("actual_end", "is", null)
          .gte("actual_end", lookbackIso)
          .lte("actual_end", payload.actual_start)
          .order("actual_end", { ascending: false })
          .limit(1);
        if (priorErr) {
          console.error("[driverPayService] driver_shifts fetch failed:", priorErr);
        }
        const lastEnd = (prior as any)?.[0]?.actual_end;
        if (lastEnd) {
          const gapHours = (startMs - new Date(lastEnd).getTime()) / 3_600_000;
          if (gapHours < 12) {
            fatigueWarning =
              `BCEA cap: only ${gapHours.toFixed(1)}h between this shift and the driver's last one. ` +
              `S15 requires 12h consecutive rest between shifts.`;
          }
        }
      }
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
    return { ok: true, shift: data as DriverShift, fatigueWarning: fatigueWarning || undefined };
  },

  async updateShift(
    id: string,
    patch: Partial<Pick<DriverShift, "actual_start" | "actual_end" | "notes" | "rate_multiplier" | "status">>,
    client: Sb = defaultClient,
    actorUserId?: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    // Phase 8 #1: snapshot the row before we mutate it so the
    // audit log can record both before + after. Best-effort - a
    // missing snapshot doesn't block the edit.
    let before: any = null;
    try {
      const { data, error: error2 } = await (client as any)
        .from("driver_shifts")
        .select("id, company_id, driver_id, actual_start, actual_end, notes, rate_multiplier, status")
        .eq("id", id)
        .maybeSingle();
      if (error2) {
        console.error("[driverPayService] driver_shifts fetch failed:", error2);
      }
      before = data || null;
    } catch {
      /* non-blocking */
    }
    const { error } = await (client as any)
      .from("driver_shifts")
      .update(patch)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    // Best-effort audit row. Settlement view + payroll reads
    // driver_shifts directly, so the immutable trail of who
    // changed what + when sits in audit_logs.
    if (before?.company_id) {
      try {
        await (client as any).from("audit_logs").insert({
          company_id: before.company_id,
          user_id: actorUserId ?? null,
          action: "driver_shift_edited",
          entity_type: "driver_shift",
          entity_id: id,
          details: { before, patch },
        });
      } catch {
        /* non-blocking */
      }
    }
    return { ok: true };
  },

  /** Soft delete - preserves historical shifts in reports. */
  async deleteShift(
    id: string,
    client: Sb = defaultClient,
    actorUserId?: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    let before: any = null;
    try {
      const { data, error: error3 } = await (client as any)
        .from("driver_shifts")
        .select("id, company_id, driver_id, actual_start, actual_end, notes, rate_multiplier, status")
        .eq("id", id)
        .maybeSingle();
      if (error3) {
        console.error("[driverPayService] driver_shifts fetch failed:", error3);
      }
      before = data || null;
    } catch {
      /* non-blocking */
    }
    const { error } = await (client as any)
      .from("driver_shifts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    if (before?.company_id) {
      try {
        await (client as any).from("audit_logs").insert({
          company_id: before.company_id,
          user_id: actorUserId ?? null,
          action: "driver_shift_deleted",
          entity_type: "driver_shift",
          entity_id: id,
          details: { before },
        });
      } catch {
        /* non-blocking */
      }
    }
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
    const [defaults, profile, shifts, orders, holidayRows] = await Promise.all([
      this.getCompanyDefaults(opts.companyId, client),
      this.getDriverProfile(opts.driverId, client),
      this.listShifts({ ...opts, range: opts.range }, client),
      this._listCompletedDeliveries(opts, client),
      // Phase 3 #2: pull holidays once so we can render per-bucket
      // BCEA breakdowns per shift. Cheap (sub-100 rows per tenant).
      (client as any)
        .from("public_holidays")
        .select("date, is_recurring")
        .eq("company_id", opts.companyId)
        .then((r: any) => r.data || []),
    ]);
    const rates = resolveEffectiveRates(profile, defaults);

    // Holiday sets for the per-shift BCEA breakdown.
    const oneOffSet = new Set<string>();
    const recurringMDSet = new Set<string>();
    for (const h of (holidayRows || []) as Array<{ date: string; is_recurring: boolean }>) {
      if (!h.date) continue;
      if (h.is_recurring) recurringMDSet.add(h.date.slice(5));
      else oneOffSet.add(h.date);
    }

    const shiftLines = shifts
      .filter((s) => s.status === "completed" && s.hours_worked != null)
      .map((s) => {
        const base = calculateShiftPay(s, rates);
        // When we have both timestamps, recompute the BCEA breakdown
        // so the admin pay UI can show per-day buckets (cross-
        // midnight Sunday + overtime are most useful to surface).
        if (s.actual_start && s.actual_end) {
          try {
            const bcea = calculateBceaShiftPay(
              s.actual_start,
              s.actual_end,
              rates.hourly_rate,
              { oneOff: oneOffSet, recurringMD: recurringMDSet },
            );
            return { ...base, bcea_buckets: bcea.buckets };
          } catch {
            // Fall through to the base line without breakdown.
          }
        }
        return base;
      });
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
   * Auto clock-in - called from the dispatch flow when a driver
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
      const { data: existing, error: existingErr } = await (client as any)
        .from("driver_shifts")
        .select("id")
        .eq("company_id", opts.companyId)
        .eq("driver_id", opts.driverId)
        .eq("order_id", opts.orderId)
        .is("actual_end", null)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingErr) {
        console.error("[driverPayService] driver_shifts fetch failed:", existingErr);
      }
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
   * Auto clock-out - called when an order transitions to delivered.
   * Closes the open auto-shift for this order, computes BCEA
   * rate_multiplier based on the day of week + public_holidays
   * table.
   *
   * BCEA s16: ordinary work on Sundays + public holidays = 2x.
   * Anything else = 1x (NULL in our schema, treated as 1 by the
   * pay calc).
   */
  async autoClockOut(
    opts: {
      companyId: string;
      driverId: string;
      orderId: string;
      /** Wave 49 B6 - which leg is closing. Defaults to 'delivery'
       *  for back-compat callers; the collection close-out path
       *  (completeCollection) passes 'collection' so the snapshot
       *  lands in its own driver_assignments row instead of
       *  overwriting the delivery leg's pay. */
      assignmentType?: string;
    },
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const { data: openShift, error: openShiftErr } = await (client as any)
        .from("driver_shifts")
        .select("id, actual_start")
        .eq("company_id", opts.companyId)
        .eq("driver_id", opts.driverId)
        .eq("order_id", opts.orderId)
        .is("actual_end", null)
        .is("deleted_at", null)
        .maybeSingle();
      if (openShiftErr) {
        console.error("[driverPayService] driver_shifts fetch failed:", openShiftErr);
      }
      if (!openShift) return { ok: true }; // nothing to close, fine

      const nowIso = new Date().toISOString();
      const startIso = (openShift as any).actual_start as string | null;

      // Phase 2 #9: BCEA multiplier needs to look across every day the
      // shift touches, not just the day actual_end falls on. A
      // Sat-23:00 -> Sun-04:00 shift used to get a single 1x or 2x
      // multiplier based on which side of midnight the clock-out
      // happened to land. We now pull the holiday set once and split
      // the shift into per-day buckets; the dominant multiplier
      // (largest bucket's day*overtime factor) is what we stamp on
      // rate_multiplier so the legacy calculateShiftPay still works.
      // The detailed per-bucket pay is computed by calculateBceaShiftPay
      // when the summary view wants the breakdown.
      const oneOffSet = new Set<string>();
      const recurringMDSet = new Set<string>();
      const { data: holidays, error: holidaysErr } = await (client as any)
        .from("public_holidays")
        .select("date, is_recurring")
        .eq("company_id", opts.companyId);
      if (holidaysErr) {
        console.error("[driverPayService] public_holidays fetch failed:", holidaysErr);
      }
      for (const h of (holidays || []) as Array<{ date: string; is_recurring: boolean }>) {
        if (!h.date) continue;
        if (h.is_recurring) recurringMDSet.add(h.date.slice(5));
        else oneOffSet.add(h.date);
      }

      let multiplier: number | null = null;
      let hoursWorked: number | null = null;
      if (startIso) {
        const startMs = new Date(startIso).getTime();
        const endMs = new Date(nowIso).getTime();
        if (Number.isFinite(startMs) && endMs > startMs) {
          hoursWorked = Number(((endMs - startMs) / 3_600_000).toFixed(4));
          // hourlyRate=1 here - we only need the dominant multiplier,
          // not the actual pay (rates get applied at summary time).
          const bcea = calculateBceaShiftPay(startIso, nowIso, 1, {
            oneOff: oneOffSet,
            recurringMD: recurringMDSet,
          });
          multiplier = bcea.dominantMultiplier > 1 ? bcea.dominantMultiplier : null;
        }
      }

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
      // calc - so changing a driver's rates next week doesn't
      // retroactively shift this delivery's pay.
      try {
        await snapshotDriverAssignmentForOrder(client, {
          companyId: opts.companyId,
          driverId: opts.driverId,
          orderId: opts.orderId,
          assignmentType: opts.assignmentType || "delivery",
        });
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
    // Wave 49 B6 - restrict the join to assignment_type='delivery'.
    // Without this filter the snapshot from the collection leg
    // (different fee structure) could be picked up as the delivery
    // pay locked total. Now each leg owns its own row.
    const { data: assignmentRows, error: assignmentRowsErr } = await (client as any)
      .from("driver_assignments")
      .select("order_id, base_fee, distance_fee, total_earnings")
      .eq("driver_id", opts.driverId)
      .eq("assignment_type", "delivery")
      .in("order_id", orderIds);
    if (assignmentRowsErr) {
      console.error("[driverPayService] driver_assignments fetch failed:", assignmentRowsErr);
    }
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
 * driver_assignments for a given (driver, order, assignment_type).
 * Idempotent: looks for an existing assignment row first, updates
 * it; if absent, inserts a fresh one.
 *
 * Wave 49 B6 - now keyed on (order_id, driver_id, assignment_type).
 * Pre-Wave-49 the lookup was (order_id, driver_id) only, which
 * meant the second autoClockOut on the same order overwrote the
 * first leg's snapshot. Same driver doing both delivery and
 * collection lost a leg's pay every time.
 *
 * Called from autoClockOut on delivery + collection completion so
 * the values get locked at the rates in force at that moment.
 * Future getPaySummary calls prefer these locked values over the
 * live calc.
 */
async function snapshotDriverAssignmentForOrder(
  client: Sb,
  opts: {
    companyId: string;
    driverId: string;
    orderId: string;
    /** Wave 49 B6 - defaults to 'delivery' for back-compat callers,
     *  but caller should pass explicitly so collection legs land in
     *  their own row. */
    assignmentType?: string;
  },
): Promise<void> {
  const assignmentType = opts.assignmentType || "delivery";

  // Pull the order's distance + the driver's effective rates.
  const { data: orderRow, error: orderRowErr } = await (client as any)
    .from("orders")
    .select("id, delivery_distance_km")
    .eq("id", opts.orderId)
    .maybeSingle();
  if (orderRowErr) {
    console.error("[driverPayService] orders fetch failed:", orderRowErr);
  }
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

  // Upsert by (order_id, driver_id, assignment_type). The composite
  // includes assignment_type now so a collection leg can't overwrite
  // a delivery leg's snapshot.
  const { data: existing, error: existingErr2 } = await (client as any)
    .from("driver_assignments")
    .select("id")
    .eq("order_id", opts.orderId)
    .eq("driver_id", opts.driverId)
    .eq("assignment_type", assignmentType)
    .maybeSingle();
  if (existingErr2) {
    console.error("[driverPayService] driver_assignments fetch failed:", existingErr2);
  }

  // Wave 49 B6 - only the delivery leg stamps delivered_at; the
  // collection leg uses completed_at. Otherwise reading delivered_at
  // would mean "delivery happened" or "collection trip closed",
  // which is a different fact each row.
  const nowIso = new Date().toISOString();
  const payload: any = {
    base_fee: line.callout_fee,
    distance_fee: line.distance_pay,
    total_earnings: line.total,
    calculated_distance: line.distance_km,
  };
  if (assignmentType === "delivery") {
    payload.delivered_at = nowIso;
  } else {
    payload.completed_at = nowIso;
  }

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
        assignment_type: assignmentType,
        status: "completed",
        ...payload,
      });
  }
}
