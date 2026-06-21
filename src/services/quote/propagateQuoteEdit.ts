/**
 * Wave 51 - propagate quote edits onto the linked order + cascade.
 *
 * The bug:
 *   quoteService.updateQuote writes only to the quotes table. When a
 *   sent + accepted quote is revised (event_date moves, total
 *   changes, menu line item swapped, equipment added) the linked
 *   orders row stays at its original values forever. Bobby's live
 *   incident: QT-20260504-KZBHFY edited from 5/14 -> 5/17, ORD-003829
 *   still showed 5/14 in the orders list, with balance_due_date
 *   stamped from the OLD event_date and pre-event reminders queued
 *   for the wrong week.
 *
 * The fix:
 *   For every quote update, if a linked order exists, mirror the
 *   relevant 22 fields, recompute date-derived stamps, and re-fire
 *   the cascade artefacts that depend on the changed fields.
 *
 * Hard rule: this service NEVER throws. Every sub-step is
 * try/wrapped and the receipt records the outcome. The caller
 * (quoteService.updateQuote) treats the return value as
 * informational.
 */
import { supabase } from "@/integrations/supabase/client";

/** The 22 fields that propagate from quote -> order. Some have a
 *  different name on the orders side; the mapping is explicit. */
const QUOTE_TO_ORDER_MAP: Array<{ quoteKey: string; orderKey: string }> = [
  { quoteKey: "client_name", orderKey: "client_name" },
  { quoteKey: "client_email", orderKey: "client_email" },
  { quoteKey: "client_phone", orderKey: "client_phone" },
  // quotes uses quote_name (not event_name); orders uses event_name.
  { quoteKey: "quote_name", orderKey: "event_name" },
  { quoteKey: "event_date", orderKey: "event_date" },
  { quoteKey: "event_time", orderKey: "event_time" },
  { quoteKey: "setup_time", orderKey: "setup_time" },
  { quoteKey: "guest_count", orderKey: "guest_count" },
  { quoteKey: "venue_address", orderKey: "venue_address" },
  { quoteKey: "venue_lat", orderKey: "venue_lat" },
  { quoteKey: "venue_lng", orderKey: "venue_lng" },
  { quoteKey: "subtotal", orderKey: "subtotal" },
  { quoteKey: "discount_amount", orderKey: "discount_amount" },
  { quoteKey: "tax_amount", orderKey: "tax_amount" },
  { quoteKey: "tax", orderKey: "tax" },
  { quoteKey: "total", orderKey: "total_amount" },
  { quoteKey: "deposit_percentage", orderKey: "deposit_percentage" },
  { quoteKey: "delivery_fee", orderKey: "delivery_fee" },
  { quoteKey: "delivery_distance_km", orderKey: "delivery_distance_km" },
  { quoteKey: "delivery_rate_per_km", orderKey: "delivery_rate_per_km" },
  { quoteKey: "collection_fee", orderKey: "collection_fee" },
  { quoteKey: "collection_distance_km", orderKey: "collection_distance_km" },
  { quoteKey: "collection_rate_per_km", orderKey: "collection_rate_per_km" },
  { quoteKey: "collection_next_day", orderKey: "collection_next_day" },
  { quoteKey: "region_id", orderKey: "region_id" },
  // notes -> internal_notes is intentionally one-way; the operator's
  // brief on the order can diverge from the customer-facing quote
  // notes. Skip from auto-mirror to avoid clobbering kitchen comments.
];

/** Fields that, when changed, require a kitchen prep re-plan. */
const PREP_RELEVANT_FIELDS = new Set([
  "event_date",
  "event_time",
  "setup_time",
  "guest_count",
]);

/** Fields that, when changed, require equipment_bookings re-window. */
const EQUIPMENT_WINDOW_FIELDS = new Set([
  "event_date",
]);

/** Fields that, when changed, require collection driver_assignment +
 *  outgoing_email_queue re-stamping. */
const SCHEDULING_FIELDS = new Set([
  "event_date",
  "event_time",
]);

/** Fields whose change demands the operator confirmation modal --
 *  exposed to the UI so it can pre-flight a confirm before save. */
export const FIELDS_REQUIRING_CONFIRMATION = [
  "event_date",
  "event_time",
  "guest_count",
  "total",
  "subtotal",
  "menu_items",
  "equipment_items",
] as const;

/** Order statuses past the point of no return - no propagation,
 *  open an order_amendment_request for dispatch review instead. */
const POST_DISPATCH_STATUSES = new Set([
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
]);

export interface PropagateQuoteEditReceipt {
  ok: boolean;
  /** True when there's no order linked to this quote - silently
   *  skipped (no error). */
  noLinkedOrder?: boolean;
  /** True when the order is past dispatch and propagation was
   *  refused. order_amendment_requests row created instead. */
  refusedPostDispatch?: boolean;
  amendmentRequestId?: string;
  orderId?: string;
  fieldsChanged: string[];
  balanceDueDateRecalculated: boolean;
  prepTasksRescheduled: boolean;
  equipmentBookingsResynced: boolean;
  collectionRescheduled: boolean;
  emailQueueResynced: boolean;
  orderItemsRebuilt: boolean;
  reason?: string;
  errors: string[];
}

/**
 * Main entry point. Idempotent.
 */
export async function propagateQuoteEditToOrder(
  quoteId: string,
  performedBy: string | null = null,
): Promise<PropagateQuoteEditReceipt> {
  const receipt: PropagateQuoteEditReceipt = {
    ok: true,
    fieldsChanged: [],
    balanceDueDateRecalculated: false,
    prepTasksRescheduled: false,
    equipmentBookingsResynced: false,
    collectionRescheduled: false,
    emailQueueResynced: false,
    orderItemsRebuilt: false,
    errors: [],
  };

  try {
    // 1. Load the freshly-updated quote.
    const { data: quote, error: qErr } = await (supabase as any)
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .maybeSingle();
    if (qErr || !quote) {
      receipt.ok = false;
      receipt.reason = qErr?.message || "quote_not_found";
      return receipt;
    }

    // 2. Find the linked order. Audit: prefer orders.quote_id (back
    //    link is reliable) over quotes.converted_to_order_id (forward
    //    link has a known bug where it's null on some live rows).
    const { data: linkedOrder, error: oErr } = await (supabase as any)
      .from("orders")
      .select("*")
      .eq("quote_id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (oErr) {
      receipt.ok = false;
      receipt.reason = `linked_order_lookup_failed: ${oErr.message}`;
      return receipt;
    }
    if (!linkedOrder) {
      receipt.noLinkedOrder = true;
      return receipt;
    }

    receipt.orderId = (linkedOrder as any).id;
    const companyId = (linkedOrder as any).company_id || (quote as any).company_id;

    // 3. Hard refusal when the order is past dispatch - we do NOT
    //    silently mutate event_date on a truck that's already rolling.
    const orderStatus = String((linkedOrder as any).status || "").toLowerCase();
    if (POST_DISPATCH_STATUSES.has(orderStatus)) {
      receipt.refusedPostDispatch = true;
      receipt.ok = false;
      receipt.reason = `order_status_${orderStatus}_blocks_propagation`;
      try {
        const proposed: Record<string, unknown> = {};
        for (const m of QUOTE_TO_ORDER_MAP) {
          const qv = (quote as any)[m.quoteKey];
          const ov = (linkedOrder as any)[m.orderKey];
          if (qv !== ov && qv !== undefined) proposed[m.orderKey] = qv;
        }
        const { data: amendRow, error: amendErr } = await (supabase as any)
          .from("order_amendment_requests")
          .insert([{
            order_id: receipt.orderId,
            company_id: companyId,
            requested_by_user_id: performedBy,
            proposed_changes: proposed,
            client_notes: `Quote ${(quote as any).quote_number || quoteId} edited after dispatch. Operator review required before applying.`,
            // TIGHTEN I.73 (2026-06-02): CHECK constraint allows
            // (pending, approved, rejected) only. Was previously
            // "requires_dispatch_review" which isn't in the CHECK -
            // every post-dispatch quote edit silently failed to create
            // its amendment request row. Use "pending" - the
            // dispatch-review flag now lives in client_notes.
            status: "pending",
          }])
          .select("id")
          .maybeSingle();
        if (amendErr) {
          receipt.errors.push(`amendment_request_insert_failed: ${amendErr.message}`);
        } else {
          receipt.amendmentRequestId = (amendRow as any)?.id;
        }
      } catch (e: any) {
        receipt.errors.push(`amendment_request_crashed: ${e?.message || e}`);
      }
      return receipt;
    }

    // 4. Build the field delta.
    const updates: Record<string, unknown> = {};
    for (const m of QUOTE_TO_ORDER_MAP) {
      const qv = (quote as any)[m.quoteKey];
      const ov = (linkedOrder as any)[m.orderKey];
      // Only mirror when the quote value is non-undefined AND differs
      // from the order. Treat null + null as equal; treat 0 vs null as
      // different (they have different semantics for money fields).
      if (qv === undefined) continue;
      if (qv === ov) continue;
      updates[m.orderKey] = qv;
      receipt.fieldsChanged.push(m.orderKey);
    }

    // 4a. Date-derived: recompute balance_due_date when event_date
    //     changes. Use the same formula as quoteService convert path.
    if (receipt.fieldsChanged.includes("event_date") && (quote as any).event_date) {
      try {
        const { data: companyRow } = await (supabase as any)
          .from("companies")
          .select("balance_due_days")
          .eq("id", companyId)
          .maybeSingle();
        const days = Number((companyRow as any)?.balance_due_days ?? 7);
        const eventDt = new Date(`${(quote as any).event_date}T00:00:00`);
        eventDt.setDate(eventDt.getDate() - days);
        const yyyy = eventDt.getFullYear();
        const mm = String(eventDt.getMonth() + 1).padStart(2, "0");
        const dd = String(eventDt.getDate()).padStart(2, "0");
        updates.balance_due_date = `${yyyy}-${mm}-${dd}`;
        receipt.balanceDueDateRecalculated = true;
      } catch (e: any) {
        receipt.errors.push(`balance_due_date_recalc_failed: ${e?.message || e}`);
      }
    }

    // 5. Apply the orders UPDATE.
    if (Object.keys(updates).length > 0) {
      (updates as any).updated_at = new Date().toISOString();
      const { error: updErr } = await (supabase as any)
        .from("orders")
        .update(updates)
        .eq("id", receipt.orderId);
      if (updErr) {
        receipt.ok = false;
        receipt.reason = `orders_update_failed: ${updErr.message}`;
        return receipt;
      }
    }

    // 6. Order line items rebuild when menu_items changed. Compare
    //    JSONB by stringification - cheap and good enough for the
    //    coarse "did anything change" question.
    const menuChanged =
      JSON.stringify((quote as any).menu_items || null) !==
      JSON.stringify((linkedOrder as any).menu_items || null);
    if (menuChanged) {
      try {
        // Delete + re-insert order_items from the quote's menu_items using the
        // shared helper the amendment path also uses (kept symmetric so the two
        // edit-cascade paths can't drift on the line-item layer).
        const { rebuildOrderItemsFromMenu } = await import("@/services/order/rebuildOrderItems");
        const rebuild = await rebuildOrderItemsFromMenu(
          supabase,
          receipt.orderId,
          (quote as any).menu_items,
          Number((quote as any).guest_count || 0),
        );
        receipt.errors.push(...rebuild.errors);
        if (rebuild.rebuilt) {
          receipt.orderItemsRebuilt = true;
          receipt.fieldsChanged.push("menu_items");
        }
      } catch (e: any) {
        receipt.errors.push(`order_items_rebuild_crashed: ${e?.message || e}`);
      }
    }

    // 7. Equipment bookings resync when equipment_items changed OR
    //    event_date moved (window-only). Diff on equipment_id +
    //    quantity; INSERT new, UPDATE quantity / window changes,
    //    soft-delete removed (where the schema supports it; otherwise
    //    set status='cancelled').
    const equipmentChanged =
      JSON.stringify((quote as any).equipment_items || null) !==
      JSON.stringify((linkedOrder as any).equipment_items || null);
    if (equipmentChanged || EQUIPMENT_WINDOW_FIELDS.has("event_date") && receipt.fieldsChanged.includes("event_date")) {
      try {
        const result = await _resyncEquipmentBookings(
          receipt.orderId!,
          companyId,
          quote,
          linkedOrder,
        );
        receipt.equipmentBookingsResynced = result.ok;
        if (equipmentChanged) receipt.fieldsChanged.push("equipment_items");
        if (!result.ok && result.reason) receipt.errors.push(result.reason);
      } catch (e: any) {
        receipt.errors.push(`equipment_resync_crashed: ${e?.message || e}`);
      }
    }

    // 8. Kitchen prep re-plan when any prep-relevant field changed.
    const needsPrepReplan = receipt.fieldsChanged.some((f) =>
      PREP_RELEVANT_FIELDS.has(f),
    ) || menuChanged;
    if (needsPrepReplan) {
      try {
        const { kitchenPrepService } = await import("../kitchenPrepService");
        await kitchenPrepService.ensurePrepTasksForOrder(
          companyId,
          receipt.orderId!,
          performedBy || undefined,
          undefined,
          { force: true },
        );
        receipt.prepTasksRescheduled = true;
      } catch (e: any) {
        receipt.errors.push(`prep_replan_crashed: ${e?.message || e}`);
      }
    }

    // 9. Collection driver_assignment + pending email queue rows
    //    re-stamp when scheduling fields moved.
    const needsRescheduling = receipt.fieldsChanged.some((f) =>
      SCHEDULING_FIELDS.has(f),
    );
    if (needsRescheduling) {
      try {
        await _restampCollectionAssignment(receipt.orderId!, quote);
        receipt.collectionRescheduled = true;
      } catch (e: any) {
        receipt.errors.push(`collection_restamp_crashed: ${e?.message || e}`);
      }
      try {
        await _restampPendingPreEventReminders(receipt.orderId!, quote);
        receipt.emailQueueResynced = true;
      } catch (e: any) {
        receipt.errors.push(`email_queue_restamp_crashed: ${e?.message || e}`);
      }
      // TIGHTEN I.54-I.57: the four restamp gaps the I.52 audit
      // surfaced. Each is best-effort - a single failing one doesn't
      // block the rest of the cascade; the receipt collects errors.
      try {
        await _restampCleaningHandover(receipt.orderId!, quote);
      } catch (e: any) {
        receipt.errors.push(`cleaning_handover_restamp_crashed: ${e?.message || e}`);
      }
      try {
        await _restampOutsourceAssignments(receipt.orderId!, quote);
      } catch (e: any) {
        receipt.errors.push(`outsource_restamp_crashed: ${e?.message || e}`);
      }
      try {
        await _restampDeliveryVehicleBooking(receipt.orderId!, quote);
      } catch (e: any) {
        receipt.errors.push(`vehicle_booking_restamp_crashed: ${e?.message || e}`);
      }
      try {
        await _restampAftersalesReminders(receipt.orderId!, quote);
      } catch (e: any) {
        receipt.errors.push(`aftersales_restamp_crashed: ${e?.message || e}`);
      }
    }

    // TIGHTEN I.58: recalc the linked invoice whenever ANY pricing-
    // relevant field changed. Without this, the client's invoice keeps
    // its old total while the order and dashboard show the new one.
    const PRICING_FIELDS = new Set([
      "subtotal", "discount_amount", "tax_amount", "tax", "total_amount",
      "delivery_fee", "delivery_distance_km", "delivery_rate_per_km",
    ]);
    const needsInvoiceRecalc = menuChanged
      || receipt.fieldsChanged.some((f) => PRICING_FIELDS.has(f));
    if (needsInvoiceRecalc) {
      await _recalcInvoice(receipt.orderId!, companyId);
    }

    // 9b. Tell the working staff the order changed so they re-check their tasks
    //     against the new spec - the amendment path broadcasts this but the
    //     quote-edit path used to run the whole cascade silently, leaving
    //     kitchen / shopping / driver / cleaning working off the OLD guest
    //     count / menu / time. Best-effort + dedup'd; never blocks the edit.
    const staffAffected =
      menuChanged || equipmentChanged || needsPrepReplan || needsRescheduling ||
      receipt.fieldsChanged.some((f) => ["guest_count", "menu_items", "equipment_items"].includes(f));
    if (staffAffected) {
      try {
        const orderLabel =
          (linkedOrder as any)?.order_number ||
          String(receipt.orderId).slice(0, 8);
        const changed = Array.from(new Set(receipt.fieldsChanged))
          .map((k) => String(k).replace(/_/g, " "))
          .join(", ") || "details";
        const { notificationService } = await import("../notificationService");
        await notificationService.broadcastNotification({
          companyId,
          type: "amendment_approved",
          title: "Order updated - re-check your tasks",
          message: `Order ${orderLabel} was updated (${changed}). Prep, shopping quantities, delivery and equipment for it may have changed - please re-check your assigned work.`,
          targetRoles: ["kitchen_staff", "shopping_staff", "driver", "cleaning_staff", "company_admin", "admin", "owner", "super_admin"] as any,
          priority: "high",
          link: `/admin/orders?orderId=${receipt.orderId}`,
          relatedEntityType: "order",
          relatedEntityId: receipt.orderId!,
          dedup: true,
        }, supabase as any);
      } catch (notifyErr: any) {
        receipt.errors.push(`staff_broadcast_failed: ${notifyErr?.message || notifyErr}`);
      }
    }

    // 9c. Wave 33: the CLIENT "order updated" email (with a fresh magic
    //     link to the live order) is NOT sent here - this helper runs in
    //     the BROWSER under the anon client, where emailService has no
    //     server-side provider secret. It's sent server-side from
    //     /api/quotes/[id]/resync-order, which the admin save ALWAYS
    //     fires right after this and which runs under service role.

    // 10. Audit row in order_amendment_requests so the change is
    //     traceable. applied_snapshot captures the orders payload + the
    //     cascade outcomes for finance / dispute resolution.
    try {
      await (supabase as any)
        .from("order_amendment_requests")
        .insert([{
          order_id: receipt.orderId,
          company_id: companyId,
          requested_by_user_id: performedBy,
          proposed_changes: updates,
          client_notes: `Auto-applied from quote ${(quote as any).quote_number || quoteId} edit.`,
          // TIGHTEN I.73 (2026-06-02): CHECK constraint allows
          // (pending, approved, rejected) only. "applied" wasn't in the
          // set - every pre-dispatch auto-applied amendment row failed
          // silently. Use "approved" + populate applied_at /
          // applied_snapshot to express "approved and already executed".
          status: "approved",
          applied_at: new Date().toISOString(),
          applied_snapshot: receipt as any,
        }]);
    } catch (auditErr: any) {
      receipt.errors.push(`audit_log_failed: ${auditErr?.message || auditErr}`);
    }

    return receipt;
  } catch (e: any) {
    receipt.ok = false;
    receipt.reason = `propagation_crashed: ${e?.message || e}`;
    return receipt;
  }
}

/** Equipment bookings resync. Diff by equipment_id; insert new,
 *  update quantity + window changes, mark removed as 'cancelled'. */
async function _resyncEquipmentBookings(
  orderId: string,
  companyId: string,
  quote: any,
  linkedOrder: any,
): Promise<{ ok: boolean; reason?: string }> {
  // Delegate to the shared helper so the quote + amendment paths stay symmetric.
  const { resyncEquipmentBookings } = await import("../order/resyncEquipmentBookings");
  return resyncEquipmentBookings(
    supabase,
    orderId,
    companyId,
    quote.equipment_items,
    quote.event_date || linkedOrder.event_date,
  );
}

/** Re-stamp collection driver_assignment.scheduled_for using the same
 *  formula as orderWorkflow's auto-scheduler: next-day -> next morning
 *  09:00; else event_time + 5h, or 23:00 that night. */
async function _restampCollectionAssignment(orderId: string, quote: any): Promise<void> {
  if (!quote.event_date) return;
  const { data: rows } = await (supabase as any)
    .from("driver_assignments")
    .select("id, status")
    .eq("order_id", orderId)
    .eq("assignment_type", "collection");
  if (!rows || rows.length === 0) return;

  const eventDt = new Date(`${quote.event_date}T00:00:00`);
  if (quote.collection_next_day) {
    eventDt.setDate(eventDt.getDate() + 1);
    eventDt.setHours(9, 0, 0, 0);
  } else if (quote.event_time) {
    const [h, m] = String(quote.event_time).split(":").map(Number);
    eventDt.setHours((h || 0) + 5, m || 0, 0, 0);
  } else {
    eventDt.setHours(23, 0, 0, 0);
  }
  const scheduledForIso = eventDt.toISOString();

  for (const row of rows as any[]) {
    if (row.status === "completed") continue; // never re-stamp closed legs
    await (supabase as any)
      .from("driver_assignments")
      .update({ scheduled_for: scheduledForIso, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }
}

/** Re-stamp queued pre-event reminder rows in outgoing_email_queue
 *  to the new event_date offsets.
 *
 *  A.13 #3 (2026-05-18 sweep): was filtering on status='pending',
 *  which isn't in the queue's CHECK (queued, in_progress, paused,
 *  sent, failed, cancelled). Result: when an operator edited a
 *  quote's event_date after dispatch, the queued pre-event reminder
 *  rows never got re-stamped to the new date - the client would
 *  receive "see you next Friday!" against the original date even
 *  after the event was pushed out. */
async function _restampPendingPreEventReminders(orderId: string, quote: any): Promise<void> {
  if (!quote.event_date) return;
  const eventTs = new Date(`${quote.event_date}T00:00:00`).getTime();

  const { data: rows } = await (supabase as any)
    .from("outgoing_email_queue")
    .select("id, template_type")
    .eq("trigger_event", "pre_event")
    .eq("trigger_ref_id", orderId)
    .eq("status", "queued");
  if (!rows || rows.length === 0) return;

  for (const row of rows as any[]) {
    let offsetMs = 0;
    // TIGHTEN I.53 (2026-06-01): the previous strings ("pre_event_
    // week_before" / "pre_event_day_before") matched nothing in the
    // live queue. orderWorkflow.ts:ensureScheduledPreEventReminders
    // writes "event_one_week_reminder" / "event_day_before_reminder".
    // So when an operator edited an event_date after dispatch, the
    // queued reminders for the OLD date kept firing on the OLD
    // schedule. Now accepted both old names for back-compat plus the
    // actual names emailService writes today.
    if (row.template_type === "event_one_week_reminder" || row.template_type === "pre_event_week_before") {
      offsetMs = -7 * 24 * 3600 * 1000;
    } else if (row.template_type === "event_day_before_reminder" || row.template_type === "pre_event_day_before") {
      offsetMs = -1 * 24 * 3600 * 1000;
    } else {
      continue;
    }
    const sendAt = new Date(eventTs + offsetMs);
    // Skip if the new send time is already in the past - the queue
    // worker would either fire it immediately or skip it; either is
    // a reasonable outcome.
    if (sendAt.getTime() < Date.now()) continue;
    await (supabase as any)
      .from("outgoing_email_queue")
      .update({ scheduled_for: sendAt.toISOString() })
      .eq("id", row.id);
  }
}

/** TIGHTEN I.54 (2026-06-01): re-stamp cleaning_event_handovers.
 *  expected_at when event_date or event_time moves. Formula matches
 *  cleaningHandoverService.createExpectedHandover (event_date +
 *  event_time + 4h). Only updates non-completed rows so an actually-
 *  closed handover stays at its closed timestamp. */
async function _restampCleaningHandover(orderId: string, quote: any): Promise<void> {
  if (!quote.event_date) return;
  const t = quote.event_time ? String(quote.event_time).slice(0, 8) : "12:00:00";
  const dt = new Date(`${quote.event_date}T${t.length === 5 ? `${t}:00` : t}`);
  if (isNaN(dt.getTime())) return;
  const expectedAtIso = new Date(dt.getTime() + 4 * 60 * 60 * 1000).toISOString();
  await (supabase as any)
    .from("cleaning_event_handovers")
    .update({ expected_at: expectedAtIso, updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .neq("status", "complete");
}

/** TIGHTEN I.55 (2026-06-01): re-stamp outsource_assignments.
 *  required_on_site_at when event_date or event_time moves. Formula
 *  matches postCreationCascade (event_date + event_time, default
 *  12:00). Skips assignments in terminal states (accepted means the
 *  provider already committed and the operator should manage any
 *  re-schedule themselves; declined/cancelled stay frozen). */
async function _restampOutsourceAssignments(orderId: string, quote: any): Promise<void> {
  if (!quote.event_date) return;
  const eventTime = quote.event_time ? String(quote.event_time).slice(0, 5) : "12:00";
  const requiredOnSiteAt = new Date(`${quote.event_date}T${eventTime}:00`).toISOString();
  await (supabase as any)
    .from("outsource_assignments")
    .update({ required_on_site_at: requiredOnSiteAt, updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .in("status", ["requested", "accepted"]);
}

/** TIGHTEN I.56 (2026-06-01): re-window the vehicle_booking that
 *  was created when the delivery driver was assigned. The delivery
 *  driver_assignment row itself doesn't store scheduled_for (it
 *  reads order.event_date live), but the vehicle_bookings row
 *  carries booked_from / booked_until snapshots that would
 *  otherwise stay pinned to the old date. Uses
 *  computeOrderVehicleWindow so the formula stays in lockstep with
 *  the original booking path. */
async function _restampDeliveryVehicleBooking(orderId: string, quote: any): Promise<void> {
  if (!quote.event_date) return;
  let computeOrderVehicleWindow: any;
  try {
    ({ computeOrderVehicleWindow } = await import("../vehicleService"));
  } catch {
    // vehicleService not present in this build, nothing to do.
    return;
  }
  const window = computeOrderVehicleWindow({
    eventDate: quote.event_date,
    eventTime: quote.event_time || null,
    requiresWaiter: false,
  });
  if (!window?.booked_from || !window?.booked_until) return;
  await (supabase as any)
    .from("vehicle_bookings")
    .update({
      booked_from: window.booked_from.toISOString(),
      booked_until: window.booked_until.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .neq("status", "completed")
    .neq("status", "cancelled");
}

/** TIGHTEN I.57 (2026-06-01): re-stamp queued aftersales rows in
 *  outgoing_email_queue. Each row's scheduled_for = event_date +
 *  monthsAfterEvent for the matching template. If the new
 *  scheduled_for falls in the past (event moved earlier and the
 *  offset would land before today), cancel the row instead of
 *  re-stamping - firing a "thanks for last week's event!" before
 *  the event has happened would be embarrassing. */
async function _restampAftersalesReminders(orderId: string, quote: any): Promise<void> {
  if (!quote.event_date) return;
  let defaultAfterSalesTemplates: Array<{ id: string; monthsAfterEvent?: number }>;
  try {
    ({ defaultAfterSalesTemplates } = await import("@/lib/afterSalesTemplates"));
  } catch {
    return;
  }
  const offsetsById = new Map<string, number>();
  for (const t of defaultAfterSalesTemplates) {
    offsetsById.set(t.id, t.monthsAfterEvent ?? 0);
  }

  const { data: rows } = await (supabase as any)
    .from("outgoing_email_queue")
    .select("id, template_type")
    .eq("trigger_event", "aftersales")
    .eq("trigger_ref_id", orderId)
    .eq("status", "queued");
  if (!rows || rows.length === 0) return;

  for (const row of rows as any[]) {
    const tplType = String(row.template_type || "");
    if (!tplType.startsWith("aftersales_")) continue;
    const tplId = tplType.slice("aftersales_".length);
    const months = offsetsById.get(tplId);
    if (months == null) continue;

    const sendAt = new Date(quote.event_date);
    sendAt.setMonth(sendAt.getMonth() + months);
    if (sendAt.getTime() < Date.now() - 24 * 3600 * 1000) {
      // Aftersales row for the new date would land in the past -
      // cancel rather than fire late.
      await (supabase as any)
        .from("outgoing_email_queue")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      continue;
    }
    await (supabase as any)
      .from("outgoing_email_queue")
      .update({ scheduled_for: sendAt.toISOString() })
      .eq("id", row.id);
  }
}

/** TIGHTEN I.58 (2026-06-01): recalculate the linked invoice when
 *  the quote totals change. Without this the deposit invoice the
 *  client is paying stays at the old amount even though the order,
 *  the dashboard and the receivables report all show the new total.
 *  Real-world impact: client underpays (or overpays), AR aging is
 *  wrong, accounting sync re-pushes nothing because the row hash
 *  hasn't changed.
 *
 *  Skips invoices in terminal states (paid, void, etc.) - those are
 *  closed business records and shouldn't be silently re-totalled. */
async function _recalcInvoice(orderId: string, companyId: string): Promise<void> {
  try {
    const { recalcInvoiceForOrder } = await import("../invoiceGenerationService");
    await recalcInvoiceForOrder(orderId, companyId);
  } catch (e: any) {
    // Surface in logs but don't crash the propagation. Operators can
    // re-trigger the invoice recalc from the invoice detail page.
    // eslint-disable-next-line no-console
    console.error(`[propagateQuoteEdit._recalcInvoice] crashed for order ${orderId}:`, e?.message || e);
  }
}

/** Pure helper for the UI - derive the impact summary for the
 *  confirmation modal. The page calls this with the FORM values
 *  before save, gets back a list of human strings. */
export function describeQuoteEditImpact(opts: {
  beforeQuote: any;
  afterQuote: any;
  linkedOrder: any | null;
}): { needsConfirmation: boolean; impacts: string[] } {
  const { beforeQuote, afterQuote, linkedOrder } = opts;
  if (!linkedOrder) return { needsConfirmation: false, impacts: [] };

  const orderStatus = String(linkedOrder.status || "").toLowerCase();
  if (POST_DISPATCH_STATUSES.has(orderStatus)) {
    return {
      needsConfirmation: true,
      impacts: [
        `Order ${linkedOrder.order_number || linkedOrder.id} is at status '${orderStatus}'.`,
        `Quote saves will NOT propagate; an amendment request opens for dispatch review.`,
      ],
    };
  }

  const impacts: string[] = [];
  let needsConfirmation = false;
  for (const f of FIELDS_REQUIRING_CONFIRMATION) {
    const before = (beforeQuote as any)?.[f];
    const after = (afterQuote as any)?.[f];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    needsConfirmation = true;
    if (f === "event_date") {
      impacts.push(`Event date moves ${before || "-"} -> ${after || "-"}. Order, balance due date, kitchen prep, equipment booking window, and collection trip will all re-stamp.`);
    } else if (f === "event_time") {
      impacts.push(`Event time moves ${before || "-"} -> ${after || "-"}. Kitchen cook-start time will recalculate.`);
    } else if (f === "guest_count") {
      impacts.push(`Guest count moves ${before ?? "-"} -> ${after ?? "-"}. Kitchen scaling + per-person line items will recalculate.`);
    } else if (f === "total" || f === "subtotal") {
      impacts.push(`${f} changes - the deposit invoice will recompute.`);
    } else if (f === "menu_items") {
      impacts.push("Menu items changed - order line items will be rebuilt.");
    } else if (f === "equipment_items") {
      impacts.push("Equipment changed - equipment bookings will be re-synced.");
    }
  }
  return { needsConfirmation, impacts };
}
