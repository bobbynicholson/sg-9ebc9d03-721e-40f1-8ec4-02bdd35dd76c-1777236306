/**
 * resyncOrderScheduleArtifacts - shared, order-shaped schedule re-sync.
 *
 * The problem Bobby raised:
 *   When an order or quote is edited, the change must land EVERYWHERE
 *   the order touches - shopping, cleaning, and the driver - so the
 *   process has no stale-time mistakes.
 *
 *   The quote-edit path (src/services/quote/propagateQuoteEdit.ts)
 *   already does this thoroughly: when event_date / event_time move it
 *   re-stamps the collection driver trip, the cleaning handover's
 *   expected return time, the vehicle booking window, etc.
 *
 *   The ORDER-amendment path (pages/api/orders/amendment-review.ts) had
 *   drifted: it applied delivery_time / venue_address / equipment_items
 *   to the order and recomputed totals + inventory + invoice + kitchen
 *   prep - but never re-stamped the collection driver schedule, the
 *   cleaning handover, or the vehicle window. So an order amended via a
 *   client change request left the driver and cleaning team working off
 *   the OLD time. That's exactly the "mistake in the process" we want
 *   gone.
 *
 * This module is the order-shaped equivalent of the propagateQuoteEdit
 * re-stamp helpers, so BOTH edit paths converge on the same downstream
 * truth. It reads the order's CURRENT row (so the caller must have
 * already written the amendment) and re-stamps from the order's
 * effective service time = delivery_time ?? event_time.
 *
 * Hard rule, same as propagateQuoteEdit: this NEVER throws. Every
 * sub-step is try/wrapped and the receipt records the outcome. The
 * caller treats the return value as informational.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResyncOrderScheduleReceipt {
  ok: boolean;
  orderId: string;
  /** Order had no event_date - nothing time-derived to re-stamp. */
  noEventDate?: boolean;
  collectionRescheduled: boolean;
  cleaningHandoverRestamped: boolean;
  cleaningCountRecomputed: boolean;
  vehicleBookingResynced: boolean;
  outsourceRestamped: boolean;
  /** The effective service time we re-stamped against, for the audit. */
  effectiveTime: string | null;
  errors: string[];
}

/**
 * Re-stamp every time-derived downstream artefact for an order from
 * its current row. Idempotent + best-effort.
 *
 * @param sb   a SupabaseClient. Server callers MUST pass the
 *             service-role client so the writes aren't RLS-blocked.
 * @param orderId the order whose row already reflects the new values.
 */
export async function resyncOrderScheduleArtifacts(
  sb: SupabaseClient,
  orderId: string,
): Promise<ResyncOrderScheduleReceipt> {
  const receipt: ResyncOrderScheduleReceipt = {
    ok: true,
    orderId,
    collectionRescheduled: false,
    cleaningHandoverRestamped: false,
    cleaningCountRecomputed: false,
    vehicleBookingResynced: false,
    outsourceRestamped: false,
    effectiveTime: null,
    errors: [],
  };

  try {
    // 1. Load the freshly-amended order row.
    const { data: order, error: oErr } = await (sb as any)
      .from("orders")
      .select("id, event_date, event_time, delivery_time")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr || !order) {
      receipt.ok = false;
      receipt.errors.push(oErr?.message || "order_not_found");
      return receipt;
    }

    const eventDate: string | null = (order as any).event_date || null;
    if (!eventDate) {
      // No date => nothing time-derived to re-stamp. Cleaning count is
      // still worth recomputing (equipment may have changed), so fall
      // through to that step but skip the time stamps.
      receipt.noEventDate = true;
    }

    // Effective service time: the amendment moves delivery_time, but
    // some orders only carry event_time. Prefer delivery_time when set
    // so a delivery_time amendment actually shifts the downstream
    // stamps; fall back to event_time. Normalise to HH:mm:ss.
    const rawTime =
      (order as any).delivery_time || (order as any).event_time || null;
    const effectiveTime = rawTime ? String(rawTime).slice(0, 8) : null;
    receipt.effectiveTime = effectiveTime;

    // --- Time-derived re-stamps (only when we have a date) ---
    if (eventDate) {
      // 2. Collection driver_assignment.scheduled_for. Formula matches
      //    propagateQuoteEdit._restampCollectionAssignment: event start
      //    + 5h, or 23:00 when no time is known. Never touch a leg
      //    that's already completed.
      try {
        const { data: rows } = await (sb as any)
          .from("driver_assignments")
          .select("id, status")
          .eq("order_id", orderId)
          .eq("assignment_type", "collection");
        if (rows && rows.length > 0) {
          const dt = new Date(`${eventDate}T00:00:00`);
          if (effectiveTime) {
            const [h, m] = effectiveTime.split(":").map(Number);
            dt.setHours((h || 0) + 5, m || 0, 0, 0);
          } else {
            dt.setHours(23, 0, 0, 0);
          }
          const scheduledForIso = dt.toISOString();
          for (const row of rows as any[]) {
            if (row.status === "completed") continue;
            await (sb as any)
              .from("driver_assignments")
              .update({
                scheduled_for: scheduledForIso,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
          }
          receipt.collectionRescheduled = true;
        }
      } catch (e: any) {
        receipt.errors.push(`collection_restamp_failed: ${e?.message || e}`);
      }

      // 3. cleaning_event_handovers.expected_at. Formula matches
      //    cleaningHandoverService.createExpectedHandover: event start
      //    + 4h cleaning lead. Only non-complete rows.
      try {
        const t = effectiveTime || "12:00:00";
        const dt = new Date(`${eventDate}T${t.length === 5 ? `${t}:00` : t}`);
        if (!isNaN(dt.getTime())) {
          const expectedAtIso = new Date(
            dt.getTime() + 4 * 60 * 60 * 1000,
          ).toISOString();
          const { error: chErr } = await (sb as any)
            .from("cleaning_event_handovers")
            .update({
              expected_at: expectedAtIso,
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", orderId)
            .neq("status", "complete");
          if (chErr) {
            receipt.errors.push(`cleaning_handover_restamp_failed: ${chErr.message}`);
          } else {
            receipt.cleaningHandoverRestamped = true;
          }
        }
      } catch (e: any) {
        receipt.errors.push(`cleaning_handover_restamp_crashed: ${e?.message || e}`);
      }

      // 4. Vehicle booking window. Reuse computeOrderVehicleWindow so
      //    the formula stays in lockstep with the original booking path.
      try {
        const { computeOrderVehicleWindow } = await import("../vehicleService");
        const window = computeOrderVehicleWindow({
          eventDate,
          eventTime: effectiveTime,
          requiresWaiter: false,
        });
        if (window?.booked_from && window?.booked_until) {
          const { error: vErr } = await (sb as any)
            .from("vehicle_bookings")
            .update({
              booked_from: window.booked_from.toISOString(),
              booked_until: window.booked_until.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", orderId)
            .neq("status", "completed")
            .neq("status", "cancelled");
          if (vErr) {
            receipt.errors.push(`vehicle_booking_resync_failed: ${vErr.message}`);
          } else {
            receipt.vehicleBookingResynced = true;
          }
        }
      } catch (e: any) {
        // vehicleService may be absent in some builds - that's fine.
        receipt.errors.push(`vehicle_booking_resync_skipped: ${e?.message || e}`);
      }

      // 5. outsource_assignments.required_on_site_at. Formula matches
      //    propagateQuoteEdit._restampOutsourceAssignments: event_date
      //    + service time (default 12:00). Only requested/accepted.
      try {
        const timeHm = effectiveTime ? effectiveTime.slice(0, 5) : "12:00";
        const requiredOnSiteAt = new Date(
          `${eventDate}T${timeHm}:00`,
        ).toISOString();
        const { error: osErr } = await (sb as any)
          .from("outsource_assignments")
          .update({
            required_on_site_at: requiredOnSiteAt,
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", orderId)
          .in("status", ["requested", "accepted"]);
        if (osErr) {
          receipt.errors.push(`outsource_restamp_failed: ${osErr.message}`);
        } else {
          receipt.outsourceRestamped = true;
        }
      } catch (e: any) {
        receipt.errors.push(`outsource_restamp_crashed: ${e?.message || e}`);
      }
    }

    // 6. Cleaning handover item count. Independent of time - this picks
    //    up equipment_items changes so the cleaning team sees the right
    //    "expect N items back" number. Reuses the canonical helper.
    try {
      const { recomputeExpectedCount } = await import("../cleaningHandoverService");
      const r = await recomputeExpectedCount(sb, orderId);
      receipt.cleaningCountRecomputed = !!r.ok;
      if (!r.ok && r.error) {
        receipt.errors.push(`cleaning_count_recompute_failed: ${r.error}`);
      }
    } catch (e: any) {
      receipt.errors.push(`cleaning_count_recompute_crashed: ${e?.message || e}`);
    }

    receipt.ok = receipt.errors.length === 0;
    return receipt;
  } catch (e: any) {
    receipt.ok = false;
    receipt.errors.push(`resync_crashed: ${e?.message || e}`);
    return receipt;
  }
}
