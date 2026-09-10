/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * driverPayoutService - DRV-B (driver-settlement deferred, 2026-05-24).
 *
 * Backs the settlement state machine on /admin/driver-settlement.
 * A "settlement" is a (driver, period_from, period_to) tuple that
 * moves draft -> reviewed -> paid as the manager works through the
 * payout cycle. Totals are snapshotted at the moment of marking so
 * a rate change next week doesn't rewrite a settled period.
 *
 * Calling shape mirrors driverPayService - flat result objects
 * ({ ok, payout?, error? }) so consumers can `if (!res.ok) throw`
 * across the module boundary without TS narrowing pain.
 */
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<any> | any;

export type DriverPayoutStatus = "draft" | "reviewed" | "paid";
export type DriverPayoutMethod = "eft" | "cash" | "mobile_money" | "other";

export interface DriverPayoutRow {
  id: string;
  company_id: string;
  driver_id: string;
  status: DriverPayoutStatus;
  period_from: string;
  period_to: string;
  hours_total: number;
  hourly_pay: number;
  distance_total_km: number;
  distance_pay: number;
  callout_pay: number;
  gross_total: number;
  paid_at: string | null;
  paid_method: DriverPayoutMethod | null;
  paid_reference: string | null;
  paid_notes: string | null;
  created_by_user_id: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  paid_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PayoutTotalsSnapshot {
  hours_total: number;
  hourly_pay: number;
  distance_total_km: number;
  distance_pay: number;
  callout_pay: number;
  gross_total: number;
}

/**
 * List the live settlements that overlap the (period_from,
 * period_to) window. Returns rows keyed by driver_id for cheap
 * lookup from the per-row settlement chip.
 *
 * "Overlap" rather than "exact match" - a settlement recorded for
 * a 14-day pay-fortnight should still surface when the operator
 * is looking at the matching 30-day view. Operators can then drill
 * into the original window.
 */
export const driverPayoutService = {
  async listForPeriod(
    opts: { companyId: string; periodFrom: string; periodTo: string },
    client: Sb = defaultClient,
  ): Promise<Map<string, DriverPayoutRow>> {
    const out = new Map<string, DriverPayoutRow>();
    const { data, error } = await (client as any)
      .from("driver_payouts")
      .select("*")
      .eq("company_id", opts.companyId)
      .is("deleted_at", null)
      // Window-overlap. A row's window overlaps the query window
      // when its from <= query.to AND its to >= query.from.
      .lte("period_from", opts.periodTo)
      .gte("period_to", opts.periodFrom)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[driverPayoutService.listForPeriod]", error);
      return out;
    }
    // First (most recent) row per driver wins. Subsequent rows are
    // ignored - the chip on the settlement table only needs one.
    for (const r of (data || []) as DriverPayoutRow[]) {
      if (!out.has(r.driver_id)) out.set(r.driver_id, r);
    }
    return out;
  },

  /**
   * Create (or surface the existing) draft settlement for a
   * (driver, period) tuple. Idempotent - the unique index on
   * (driver_id, period_from, period_to) prevents duplicates, so we
   * fetch first and only insert when absent. Returns the row so
   * the caller can flip status straight to 'reviewed' or 'paid'
   * without a second round trip.
   */
  async ensureDraft(
    opts: {
      companyId: string;
      driverId: string;
      periodFrom: string;
      periodTo: string;
      totals: PayoutTotalsSnapshot;
      actorUserId?: string | null;
    },
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; payout?: DriverPayoutRow; error?: string }> {
    // Look for an existing live row first.
    const { data: existing, error: existingErr } = await (client as any)
      .from("driver_payouts")
      .select("*")
      .eq("company_id", opts.companyId)
      .eq("driver_id", opts.driverId)
      .eq("period_from", opts.periodFrom)
      .eq("period_to", opts.periodTo)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingErr) {
      console.warn("[driverPayoutService.ensureDraft][lookup]", existingErr);
    }
    if (existing) {
      return { ok: true, payout: existing as DriverPayoutRow };
    }

    const insertRow: any = {
      company_id: opts.companyId,
      driver_id: opts.driverId,
      status: "draft",
      period_from: opts.periodFrom,
      period_to: opts.periodTo,
      hours_total: opts.totals.hours_total,
      hourly_pay: opts.totals.hourly_pay,
      distance_total_km: opts.totals.distance_total_km,
      distance_pay: opts.totals.distance_pay,
      callout_pay: opts.totals.callout_pay,
      gross_total: opts.totals.gross_total,
      created_by_user_id: opts.actorUserId ?? null,
    };
    const { data, error } = await (client as any)
      .from("driver_payouts")
      .insert(insertRow)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };

    // Audit row. Settlement creation is the start of the money-out
    // trail so we log it explicitly. Best-effort; doesn't block.
    try {
      await (client as any).from("audit_logs").insert({
        company_id: opts.companyId,
        user_id: opts.actorUserId ?? null,
        action: "driver_payout_drafted",
        entity_type: "driver_payout",
        entity_id: (data as any).id,
        details: {
          driver_id: opts.driverId,
          period: { from: opts.periodFrom, to: opts.periodTo },
          totals: opts.totals,
        },
      });
    } catch { /* non-blocking */ }

    return { ok: true, payout: data as DriverPayoutRow };
  },

  /**
   * Mark a draft / reviewed settlement as paid. Refreshes the
   * totals snapshot - the operator may have re-pulled the period
   * between drafting and paying. Records paid_at, paid_by,
   * paid_method, paid_reference.
   *
   * Forward-only. Going paid -> reviewed is not supported through
   * this method; correcting a wrong payout means soft-deleting the
   * row and creating a new one (or just record a manual journal).
   */
  async markPaid(
    opts: {
      payoutId: string;
      paidMethod: DriverPayoutMethod;
      paidReference?: string | null;
      paidNotes?: string | null;
      paidAt?: string;
      totals?: PayoutTotalsSnapshot;
      actorUserId?: string | null;
    },
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; payout?: DriverPayoutRow; error?: string }> {
    // Snapshot the before-row for the audit log.
    let before: DriverPayoutRow | null = null;
    try {
      const { data } = await (client as any)
        .from("driver_payouts")
        .select("*")
        .eq("id", opts.payoutId)
        .maybeSingle();
      before = (data || null) as DriverPayoutRow | null;
    } catch { /* non-blocking */ }

    const patch: any = {
      status: "paid",
      paid_at: opts.paidAt ?? new Date().toISOString(),
      paid_method: opts.paidMethod,
      paid_reference: opts.paidReference ?? null,
      paid_notes: opts.paidNotes ?? null,
      paid_by_user_id: opts.actorUserId ?? null,
    };
    if (opts.totals) {
      patch.hours_total = opts.totals.hours_total;
      patch.hourly_pay = opts.totals.hourly_pay;
      patch.distance_total_km = opts.totals.distance_total_km;
      patch.distance_pay = opts.totals.distance_pay;
      patch.callout_pay = opts.totals.callout_pay;
      patch.gross_total = opts.totals.gross_total;
    }
    const { data, error } = await (client as any)
      .from("driver_payouts")
      .update(patch)
      .eq("id", opts.payoutId)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };

    if (before?.company_id) {
      try {
        await (client as any).from("audit_logs").insert({
          company_id: before.company_id,
          user_id: opts.actorUserId ?? null,
          action: "driver_payout_paid",
          entity_type: "driver_payout",
          entity_id: opts.payoutId,
          details: { before, patch },
        });
      } catch { /* non-blocking */ }
    }
    return { ok: true, payout: data as DriverPayoutRow };
  },

  /**
   * Soft-delete a recorded payout. Used when the operator made the
   * payout in error - the row stays for audit but stops counting as
   * "settled this period". A fresh draft can then be created on
   * the same (driver, period) tuple because the unique index is
   * partial on deleted_at IS NULL.
   */
  async reverse(
    opts: { payoutId: string; reason?: string | null; actorUserId?: string | null },
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; error?: string }> {
    let before: DriverPayoutRow | null = null;
    try {
      const { data } = await (client as any)
        .from("driver_payouts")
        .select("*")
        .eq("id", opts.payoutId)
        .maybeSingle();
      before = (data || null) as DriverPayoutRow | null;
    } catch { /* non-blocking */ }

    const { error } = await (client as any)
      .from("driver_payouts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", opts.payoutId);
    if (error) return { ok: false, error: error.message };

    if (before?.company_id) {
      try {
        await (client as any).from("audit_logs").insert({
          company_id: before.company_id,
          user_id: opts.actorUserId ?? null,
          action: "driver_payout_reversed",
          entity_type: "driver_payout",
          entity_id: opts.payoutId,
          details: { before, reason: opts.reason || null },
        });
      } catch { /* non-blocking */ }
    }
    return { ok: true };
  },

  /**
   * Lifetime paid total for a driver. Used by the settlement page
   * to render "Lifetime paid: R xxx" next to the driver name once
   * we know which driver is being inspected. One round trip, sum
   * client-side so we get a number on a tenant with no settlements.
   */
  async getLifetimePaid(
    opts: { companyId: string; driverId: string },
    client: Sb = defaultClient,
  ): Promise<number> {
    const { data, error } = await (client as any)
      .from("driver_payouts")
      .select("gross_total")
      .eq("company_id", opts.companyId)
      .eq("driver_id", opts.driverId)
      .eq("status", "paid")
      .is("deleted_at", null);
    if (error) {
      console.warn("[driverPayoutService.getLifetimePaid]", error);
      return 0;
    }
    return ((data || []) as Array<{ gross_total: number }>).reduce(
      (sum, r) => sum + Number(r.gross_total || 0),
      0,
    );
  },
};
