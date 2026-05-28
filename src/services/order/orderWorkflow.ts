import { supabase as browserSupabase } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notificationService";
import { emailService } from "@/services/emailService";
import { whatsappIntegrationService } from "@/services/whatsappIntegrationService";
import { ensureInvoiceForOrder } from "@/services/invoiceGenerationService";
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";
import { resolveEmailTemplate } from "@/services/email/templateResolver";

// Wave 24: orderWorkflow is called from BOTH the browser (admin pages
// updating order status) AND the server (cron jobs, payment webhooks,
// auto-completion workers). The imported browser anon supabase has no
// session on the server, so RLS hides company / template / contact
// rows and silently breaks the customer-facing email + notification
// fan-out. resolveServerClient picks service-role on the server,
// browser anon in the browser, so the rest of the module can keep
// reading `supabase` as before. Pattern lifted from cancellationEmails.ts.
function resolveServerClient(): any {
  if (typeof window !== "undefined") return browserSupabase;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getServiceSupabase } = require("@/lib/supabase/service") as { getServiceSupabase: () => any };
    return getServiceSupabase();
  } catch {
    return browserSupabase;
  }
}
const supabase: any = resolveServerClient();

/**
 * Order Workflow Management
 * Handles order status transitions, assignments, and workflow logic
 */

// Allowed transitions for the order lifecycle. Source-of-truth for
// which next-status the workflow accepts given a current status.
// Cancelled / completed are terminal in this map (re-opening goes
// through a different code path, not this function). Pre-event
// keeps the existing flexibility (pending can go back to draft for
// quote rebuild). [P0-12]
// Audit (May 2026): out_for_delivery removed - the DB enum has no
// such value, every write that tried it was silently rejected, and
// readers across 21 files were filtering for a status that could
// never exist. Canonical "truck is rolling" status is in_transit.
const ALLOWED_ORDER_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled", "in_transit", "ready"],
  preparing: ["ready", "cancelled", "in_transit"],
  ready: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: ["completed", "cancelled"],
  completed: [], // terminal
  cancelled: [], // terminal
};

// Phase 3 #6: explicit source-status allowlists for the cancel /
// pause / resume paths. These functions write status directly (they
// bypass updateOrderStatus because they have their own cascade
// payload), so the ALLOWED_ORDER_TRANSITIONS map doesn't apply.
// Without these sets, cancel/pause silently accepted any status the
// caller could read and the per-function ad-hoc guards only caught
// terminal states. Now they share the same intent as the main
// transition map.
//
//   ALLOWED_CANCEL_FROM:
//     Anywhere pre-completion is legal - cancelling a confirmed
//     order, a preparing order, even an in-transit one (truck
//     breakdown) is real. Cancelling a delivered order should go
//     via refund / credit-note, not a fresh cancellation, so it's
//     excluded. Cancelled / completed are terminal.
//   ALLOWED_PAUSE_FROM:
//     Pre-event lifecycle only. Pausing a delivered or in-transit
//     order makes no sense (the food is already out the door).
//     Drivers + kitchen need decisive state, not 'on hold'.
//   ALLOWED_RESUME_FROM:
//     Trivially {paused}. Kept here for symmetry.
const ALLOWED_CANCEL_FROM = new Set<string>([
  "draft", "pending", "confirmed", "preparing", "ready",
  "in_transit", "paused",
]);
const ALLOWED_PAUSE_FROM = new Set<string>([
  "draft", "pending", "confirmed", "preparing", "ready",
]);
const ALLOWED_RESUME_FROM = new Set<string>(["paused"]);

export async function updateOrderStatus(
  orderId: string,
  newStatus: string,
  updatedBy?: string
) {
  try {
    // State-machine guard. Read current status before update; reject
    // transitions not in ALLOWED_ORDER_TRANSITIONS. Previously the
    // function happily flipped pending -> delivered, skipping
    // confirmed-time invoice creation, kitchen prep, and inventory
    // deduction. [P0-12]
    const { data: current, error: currentErr } = await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (currentErr) {
      console.error("[order/orderWorkflow] orders fetch failed:", currentErr);
    }
    const currentStatus = (current as any)?.status as string | null | undefined;

    // Idempotency guard: if the order is already in the target state,
    // bail early. Without this, a duplicate markDelivered (network
    // retry, double-tap on the driver portal) would re-write the
    // same status, re-fire side-effects (pending_reviews upsert,
    // notifications, after-sales scheduler), and double-stamp
    // confirmed_at. The DB upserts are idempotent on their own keys
    // but the notification fan-out and emailService side-effects
    // are not [P1-13].
    if (currentStatus && currentStatus === newStatus) {
      return { success: true, data: { id: orderId, status: currentStatus, _idempotent: true } };
    }

    if (currentStatus && currentStatus !== newStatus) {
      const allowed = ALLOWED_ORDER_TRANSITIONS[currentStatus];
      if (allowed && !allowed.includes(newStatus)) {
        return {
          success: false,
          error: `Invalid order transition ${currentStatus} -> ${newStatus}. Allowed next steps: ${allowed.length ? allowed.join(", ") : "(terminal state)"}.`,
        };
      }
    }

    // Temporal sanity guard on in_transit. A driver tapping
    // "Start delivery" two days before the event is almost
    // certainly a misclick - "in_transit" semantically means
    // "rolling toward the venue right now", not "I'll be rolling
    // on Saturday". Without this gate the status badge reads
    // "En Route" on the GPS Tracking page for the entire window
    // between claim and the actual event - misleading the client
    // (who already got the "Driver on the way" push) and breaking
    // the on-time KPIs (picked_up_at lands two days early).
    //
    // Window: allow in_transit only when the event is within the
    // next 24 hours. Outside that, return a clear error the UI
    // can surface as a toast. Past-event orders are still
    // allowed to roll (recovery flows).
    if (newStatus === "in_transit") {
      try {
        const { data: tempCheck } = await supabase
          .from("orders")
          .select("event_date, event_time")
          .eq("id", orderId)
          .maybeSingle();
        const eventDate = (tempCheck as any)?.event_date as string | null;
        if (eventDate) {
          const eventTime = ((tempCheck as any)?.event_time as string | null) || "00:00";
          const eventStart = new Date(`${eventDate}T${eventTime.slice(0, 5)}:00`);
          if (!isNaN(eventStart.getTime())) {
            const hoursUntilEvent = (eventStart.getTime() - Date.now()) / 3_600_000;
            if (hoursUntilEvent > 24) {
              return {
                success: false,
                error: `Too early to mark this order in transit - the event is ${Math.round(hoursUntilEvent)} hours away. Start delivery within 24 hours of the event start.`,
              };
            }
          }
        }
      } catch (eventErr) {
        // Lookup failure is non-fatal - we'd rather let the status
        // change through than block a legitimate roll on a
        // transient read error.
        console.warn("[orderWorkflow] event window check crashed (non-blocking):", eventErr);
      }
    }

    // Stamp every lifecycle moment the first time an order reaches
    // it. Audit (May 2026, Wave 5): the previous block only wrote
    // confirmed_at. Downstream KPIs key off picked_up_at and (more
    // critically) delivered_at - driver on-time rate, dispatch
    // KPI tile, and the orders timeline all read NULL today because
    // nothing ever stamped it. Now writes every <status>_at the
    // first time the order transitions into that status.
    const advancedStatuses = new Set([
      "confirmed", "preparing", "ready", "in_transit",
      "delivered", "completed",
    ]);
    const updates: any = {
      status: newStatus as any,
      updated_at: new Date().toISOString(),
    };
    const nowIso = new Date().toISOString();
    if (advancedStatuses.has(newStatus)) {
      const { data: prior, error: priorErr } = await supabase
        .from("orders")
        .select("confirmed_at, ready_at, picked_up_at, delivered_at, completed_at")
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      if (priorErr) {
        console.error("[order/orderWorkflow] orders fetch failed:", priorErr);
      }
      // confirmed_at - any advanced status counts as "past confirmed"
      if (!(prior as any)?.confirmed_at) updates.confirmed_at = nowIso;
      // Per-status stamps - never clobber an existing value. The
      // orders table has ready_at / picked_up_at / delivered_at /
      // completed_at columns (preparing_at does not exist, so
      // preparing status doesn't stamp a per-state column).
      if (newStatus === "ready" && !(prior as any)?.ready_at) {
        updates.ready_at = nowIso;
      }
      if (newStatus === "in_transit" && !(prior as any)?.picked_up_at) {
        updates.picked_up_at = nowIso;
      }
      if (newStatus === "delivered" && !(prior as any)?.delivered_at) {
        updates.delivered_at = nowIso;
      }
      if (newStatus === "completed" && !(prior as any)?.completed_at) {
        updates.completed_at = nowIso;
      }
    }

    const { data: order, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    // Create status history entry
    await supabase.from("order_status_history").insert({
      order_id: orderId,
      status: newStatus,
      changed_by: updatedBy || null,
      notes: `Status changed to ${newStatus}`,
    });

    // Wave 11 #12: cross-cutting audit_logs row for the transition.
    // order_status_history is the domain table (one row per status
    // change); audit_logs is the platform-wide trail used for the
    // "show me everything that happened on this entity" view.
    // Best-effort - a failed audit insert never rolls back a real
    // status flip.
    if (order.company_id) {
      try {
        await (supabase as any).from("audit_logs").insert({
          company_id: order.company_id,
          user_id: updatedBy || null,
          action: `order_status_${newStatus}`,
          entity_type: "order",
          entity_id: orderId,
          details: {
            order_number: (order as any).order_number,
            from_status: (order as any).status,
            to_status: newStatus,
          },
        });
      } catch (auditErr) {
        console.warn("[orderWorkflow] audit_logs insert failed (non-blocking):", auditErr);
      }
    }

    // Wave 49 B1 - lockstep mirror to driver_assignments. Pre-Wave-49
    // every orders.status flip wrote the orders.<status>_at stamp but
    // never touched the matching driver_assignments row. Result:
    //   * driver_assignments.status rotted at 'accepted' for the
    //     entire lifetime of the assignment
    //   * dispatchService.getDriverPerformance filtered on
    //     da.status='completed' - never matched - silently
    //     under-counted every driver's stats
    //   * delivered_at / completed_at lived only on orders, not
    //     on driver_assignments where payroll reads from
    // The same pattern that fixed the assignment-write race in Wave
    // 47 (claim_order RPC + assignDriverWithGate writing the row)
    // now extends to status progression.
    if (newStatus === "in_transit" || newStatus === "delivered" || newStatus === "completed") {
      try {
        await _lockstepMirrorToDriverAssignment(order.id, newStatus, nowIso);
      } catch (mirrorErr) {
        console.warn("[orderWorkflow] driver_assignments lockstep mirror failed (non-blocking):", mirrorErr);
      }
    }

    // Send notifications based on status
    await sendStatusNotifications(order);

    // Kitchen prep lead-hours warning on confirm. Audit Kitchen G5:
    // a 2-hour-from-event confirm with a 4-hour recipe is structurally
    // impossible - prep_starts_at lands in the past, kitchen tablet
    // shows the order as on-track, then the food is late. Compute the
    // gap between now and event_start; if it's tighter than the
    // tenant's configured lead time, raise a HIGH-priority bell so
    // the operator can either push the event back or hire help.
    // Non-blocking: we WARN rather than refuse the confirm because
    // operators occasionally take same-day rush jobs with a price
    // premium and know what they're doing.
    if (newStatus === "confirmed" && order.company_id && order.event_date) {
      try {
        const { data: co } = await supabase
          .from("companies")
          .select("kitchen_prep_lead_hours")
          .eq("id", order.company_id)
          .maybeSingle();
        const leadHours = Number((co as any)?.kitchen_prep_lead_hours ?? 12);
        if (leadHours > 0) {
          const eventStart = new Date(order.event_date);
          if (order.event_time) {
            const [h, m] = String(order.event_time).split(":").map(Number);
            eventStart.setHours(h || 0, m || 0, 0, 0);
          }
          const hoursUntilEvent = (eventStart.getTime() - Date.now()) / (60 * 60 * 1000);
          if (hoursUntilEvent < leadHours) {
            void notificationService.broadcastNotification({
              companyId: order.company_id,
              regionId: (order as any).region_id || null,
              targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
              title: `Tight kitchen lead time on order ${order.order_number || order.id}`,
              message: `Order confirmed with only ${Math.max(0, hoursUntilEvent).toFixed(1)}h until event start. Kitchen needs ${leadHours}h to prep cleanly - consider pushing the event back or assigning extra hands.`,
              type: "kitchen_prep_lead_short",
              priority: "high",
              link: `/order/${order.id}?role=kitchen_staff`,
              relatedEntityType: "order",
              relatedEntityId: order.id,
            }).catch((e) => {
              console.warn("[orderWorkflow] lead-hours warn broadcast failed:", e);
            });
          }
        }
      } catch (e) {
        console.warn("[orderWorkflow] kitchen lead-hours check crashed (non-blocking):", e);
      }
    }

    // Auto-invoice on the confirmed transition. Idempotent - if
    // an invoice already exists for this order, the helper returns
    // it without creating a duplicate. Imported / quarantined orders
    // are skipped automatically. Non-blocking: a failed invoice
    // generation logs but doesn't break the status update.
    if (newStatus === "confirmed" && order.company_id) {
      try {
        const inv = await ensureInvoiceForOrder(order.id, order.company_id);
        if (!inv.success) {
          console.warn("[orderWorkflow] auto-invoice failed:", inv.error);
        }
      } catch (e) {
        console.warn("[orderWorkflow] auto-invoice crashed (non-blocking):", e);
      }
    }

    // Schedule the after-sales email sequence on completion. We hook
    // 'completed' (after the final invoice is paid) rather than
    // 'delivered' so we only nurture customers who actually closed
    // out the engagement. ensureScheduledAfterSales is idempotent so
    // re-running on an already-scheduled order is safe. Non-blocking.
    if (newStatus === "completed" && order.company_id) {
      try {
        await ensureScheduledAfterSales(order);
      } catch (e) {
        console.warn("[orderWorkflow] after-sales scheduling crashed (non-blocking):", e);
      }
    }

    // Schedule pre-event reminders on confirm. Closes the audit gap
    // "no automated pre-event reminders" - the templates existed
    // but nothing fired them. We schedule a 1-week-before and a
    // 1-day-before email; both honour the same quarantine + block
    // gates as everything else via emailService.
    if (newStatus === "confirmed" && order.company_id) {
      try {
        await ensureScheduledPreEventReminders(order);
      } catch (e) {
        console.warn("[orderWorkflow] pre-event reminders crashed (non-blocking):", e);
      }
    }

    // Wave 47 - prep tasks auto-gen on confirmed transition.
    // Pre-Wave-47 ensurePrepTasksForOrder ran only inside
    // postCreationCascade (at order creation). Orders that were
    // converted from quote / draft and only later transitioned to
    // confirmed never got prep tasks generated - the chef opened
    // the kitchen portal to an empty list. ensurePrepTasksForOrder
    // is idempotent so a re-run on an order that already has tasks
    // is a cheap no-op.
    if (newStatus === "confirmed" && order.company_id) {
      try {
        const { kitchenPrepService } = await import("../kitchenPrepService");
        await kitchenPrepService.ensurePrepTasksForOrder(order.company_id, order.id);
      } catch (e) {
        console.warn("[orderWorkflow] prep tasks ensure on confirm crashed (non-blocking):", e);
      }
    }

    // Queue the 24h post-delivery review prompt. Replaces the old
    // setTimeout(callback, 24h) in notificationService - serverless
    // functions don't survive that long so the timer never fired.
    // We write a pending_reviews row here and a Vercel cron worker
    // (process-pending-reviews) drains it once due_at has passed.
    // Idempotent on order_id via the unique index, so a retry on the
    // delivered transition just no-ops. Wrapped so a failure here
    // never blocks the order delivery.
    // Phase 2 #5: every delivered order should have a POD on file.
    // When the driver hit "at_venue" via the geofence / status tap and
    // skipped the POD capture dialog, the order is marked delivered
    // with pod_captured_at = NULL. Broadcast a notification to admin so
    // they can chase the driver for proof before the client phones
    // disputing the delivery. Non-blocking. Skipped on retries (the
    // delivered transition is idempotent and we don't want to spam the
    // bell every time the status restamps).
    if (newStatus === "delivered" && order.company_id) {
      try {
        const { data: deliveredRow } = await (supabase as any)
          .from("orders")
          .select("pod_captured_at, order_number, region_id")
          .eq("id", order.id)
          .maybeSingle();
        if (deliveredRow && !(deliveredRow as any).pod_captured_at) {
          const { notificationService } = await import("@/services/notificationService");
          await notificationService.broadcastNotification({
            companyId: order.company_id,
            regionId: (deliveredRow as any).region_id || null,
            targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
            title: `POD missing on ${(deliveredRow as any).order_number || order.id.slice(0, 8)}`,
            message:
              `Order was marked delivered without proof-of-delivery (photo + signature). ` +
              `Ask the driver to capture POD on the driver app, or accept the bare delivery on the order detail.`,
            type: "pod_missing",
            priority: "high",
            link: `/order/${order.id}?role=admin`,
            relatedEntityType: "order",
            relatedEntityId: order.id,
          });
        }
      } catch (podWarnErr) {
        console.warn("[orderWorkflow] POD-missing broadcast failed (non-blocking):", podWarnErr);
      }
    }

    if (newStatus === "delivered" && order.company_id) {
      try {
        const deliveredAt = new Date();
        const dueAt = new Date(deliveredAt.getTime() + 24 * 60 * 60 * 1000);

        // Resolve the auth uid for the in-app notification target. Null
        // is fine - the cron handler will skip the in-app push and
        // still send the email if we have an address.
        let clientUserId: string | null = null;
        try {
          clientUserId = await resolveClientUserId(supabase, order.client_id || null);
        } catch (e) {
          console.warn("[orderWorkflow] resolveClientUserId failed (non-blocking):", e);
        }

        const { error: prErr } = await (supabase as any)
          .from("pending_reviews")
          .upsert(
            {
              company_id: order.company_id,
              order_id: order.id,
              client_id: order.client_id || null,
              client_user_id: clientUserId,
              client_email: order.client_email || null,
              client_name: order.client_name || null,
              delivered_at: deliveredAt.toISOString(),
              due_at: dueAt.toISOString(),
            },
            { onConflict: "order_id", ignoreDuplicates: true },
          );
        if (prErr) {
          // Surface to audit_logs so the operator can see review prompts
          // that never queued [P1-35]. Previously this was warn-only and
          // a silently-skipped row meant the 24h follow-up email never
          // sent for that order, undetectably.
          console.warn("[orderWorkflow] pending_reviews upsert error:", prErr.message);
          try {
            await (supabase as any).from("audit_logs").insert({
              company_id: order.company_id,
              user_id: updatedBy || null,
              action: "pending_review_queue_failed",
              entity_type: "order",
              entity_id: order.id,
              details: { error: prErr.message, order_number: order.order_number },
            });
          } catch { /* never throw from a fail-log */ }
        }
      } catch (e: any) {
        console.warn("[orderWorkflow] pending_reviews insert crashed (non-blocking):", e);
        try {
          await (supabase as any).from("audit_logs").insert({
            company_id: order.company_id,
            user_id: updatedBy || null,
            action: "pending_review_queue_crashed",
            entity_type: "order",
            entity_id: order.id,
            details: { error: e?.message || String(e), order_number: order.order_number },
          });
        } catch { /* never throw from a fail-log */ }
      }
    }

    // Auto-schedule a collection driver_assignment on delivered.
    // Audit Driver G4 + Equipment G5: the platform never scheduled
    // a return trip to collect equipment after the event ended.
    // Operators ran the collection off paper notes; drivers weren't
    // paid for the return leg; equipment availability stayed stuck
    // because the cleaning queue had no trigger.
    //
    // Strategy: when the order is marked delivered AND has at least
    // one equipment_booking, insert a second driver_assignments row
    // with assignment_type='collection', linked to the original
    // delivery assignment via parent_assignment_id, scheduled_for
    // event_date end + 1 hour. Driver defaults to the same person
    // who delivered (most common pattern); dispatch can re-assign
    // before the scheduled time. Idempotent on (order_id, type).
    if (newStatus === "delivered" && order.company_id) {
      try {
        // Flow audit Leg E P0-14: orders with a waiter on-site don't
        // need a separate collection trip. The waiter stays through the
        // event, packs the equipment down, and brings it back with
        // them. Auto-scheduling a collection assignment in that case
        // double-charged the driver run (pay was claimed twice) and
        // confused dispatch ("why is there a 23:00 pickup when Mary's
        // already on the truck?"). Skip when requires_waiter is true.
        if (order.requires_waiter === true) {
          // fall through to the cleaning-queue insert below
        } else {
        // Skip when no equipment was on this order - no collection
        // needed. Audit (May 2026, Wave 4): the count previously
        // didn't filter by status, so cancelled bookings under an
        // amendment-revised order still triggered a phantom collection
        // assignment.
        const { count: bookingCount } = await supabase
          .from("equipment_bookings")
          .select("id", { count: "exact", head: true })
          .eq("order_id", order.id)
          .eq("status", "booked");
        if ((bookingCount ?? 0) > 0) {
          // Idempotency check.
          const { data: existingCollection, error: existingCollectionErr } = await (supabase as any)
            .from("driver_assignments")
            .select("id")
            .eq("order_id", order.id)
            .eq("assignment_type", "collection")
            .maybeSingle();
          if (existingCollectionErr) {
            console.error("[order/orderWorkflow] driver_assignments fetch failed:", existingCollectionErr);
          }
          if (!existingCollection) {
            // Find the delivery assignment to copy driver + as parent.
            const { data: deliveryAssignment, error: deliveryAssignmentErr } = await (supabase as any)
              .from("driver_assignments")
              .select("id, driver_id")
              .eq("order_id", order.id)
              .eq("assignment_type", "delivery")
              .maybeSingle();
            if (deliveryAssignmentErr) {
              console.error("[order/orderWorkflow] driver_assignments fetch failed:", deliveryAssignmentErr);
            }

            const deliveryDriverId =
              (deliveryAssignment as any)?.driver_id || order.assigned_driver_id || null;
            if (deliveryDriverId) {
              // Default collection time: event_date + 22:00 + 1hr (i.e.
              // 23:00). When event_time is set, use event_time + a 4hr
              // assumed event duration + 1hr buffer instead.
              let scheduledFor: Date;
              const evDate = order.event_date ? new Date(order.event_date) : new Date();
              if (order.event_time) {
                const [h, m] = String(order.event_time).split(":").map(Number);
                evDate.setHours(h || 0, m || 0, 0, 0);
                // Event start + 4hr assumed duration + 1hr collection buffer.
                scheduledFor = new Date(evDate.getTime() + 5 * 60 * 60 * 1000);
              } else {
                evDate.setHours(23, 0, 0, 0);
                scheduledFor = evDate;
              }

              const { error: insErr } = await (supabase as any)
                .from("driver_assignments")
                .insert({
                  company_id: order.company_id,
                  order_id: order.id,
                  driver_id: deliveryDriverId,
                  assignment_type: "collection",
                  scheduled_for: scheduledFor.toISOString(),
                  parent_assignment_id: (deliveryAssignment as any)?.id || null,
                  status: "pending",
                  notes:
                    "Collection trip: return to venue, pick up equipment, deliver to kitchen for cleaning.",
                });
              if (insErr) {
                console.warn(
                  "[orderWorkflow] collection assignment insert failed (non-blocking):",
                  insErr.message,
                );
              } else {
                // Ping the driver so they see the upcoming collection
                // on their dashboard.
                try {
                  await notificationService.createNotification({
                    company_id: order.company_id,
                    user_id: deliveryDriverId,
                    recipient_id: deliveryDriverId,
                    title: "Collection trip scheduled",
                    message: `Pick-up scheduled for order ${order.order_number || order.id} at ${scheduledFor.toLocaleString("en-ZA")}. Equipment needs to come back to base.`,
                    notification_type: "collection_scheduled",
                    priority: "normal",
                    link: `/team-portal/driver/deliveries?orderId=${order.id}`,
                    related_entity_type: "order",
                    related_entity_id: order.id,
                  });
                } catch (notifErr) {
                  console.warn(
                    "[orderWorkflow] collection driver notification failed (non-blocking):",
                    notifErr,
                  );
                }
              }
            }
          }
        }
        } // end of waiter-skip else
      } catch (e: any) {
        console.warn("[orderWorkflow] collection assignment scheduler crashed (non-blocking):", e);
      }
    }

    // Auto-queue cleaning rows on delivered. The audit flagged that
    // equipment_cleaning_status had no writer anywhere - cleaning
    // team's inbox was permanently empty because no code path
    // inserted into the table. When the order hits 'delivered',
    // walk its equipment_bookings and insert one cleaning row per
    // booked equipment unit so the cleaning team has work to pick up.
    //
    // Idempotency: skip rows where a cleaning_status already exists
    // for (order_id, equipment_id). Non-blocking on failure.
    if (newStatus === "delivered" && order.company_id) {
      try {
        // Wave 70.24 - pull equipment_bookings WITH the cleaning
        // flags so we can filter out items that don't need cleaning
        // (disposables, tables, supplier-cleaned hire-in). Without
        // this filter the trigger spawned a cleaning_jobs row for
        // every booking, flooding the queue with noise.
        const { data: bookings } = await supabase
          .from("equipment_bookings")
          .select(`
            id, equipment_id, quantity,
            equipment:equipment_id (
              requires_cleaning, dishwasher_safe, is_hire_in, supplier_cleans
            )
          `)
          .eq("order_id", (order as any).id);

        // Wave 70.24 - ensure the cleaning_event_handover row
        // exists + flip it to 'in_progress'. The handover is the
        // event-level container the cleaning portal groups jobs
        // under. Done BEFORE the cleaning_jobs insert so the
        // linking event_handover_id is available.
        let handoverId: string | null = null;
        try {
          const { markHandoverReturned } = await import("@/services/cleaningHandoverService");
          const result = await markHandoverReturned(supabase as any, {
            companyId: (order as any).company_id,
            orderId: (order as any).id,
            eventDate: (order as any).event_date || null,
            eventTime: (order as any).event_time || null,
          });
          handoverId = result.ok && result.handoverId ? result.handoverId : null;
          if (!result.ok) {
            console.warn("[orderWorkflow] markHandoverReturned failed (non-blocking):", result.error);
          }
        } catch (he: any) {
          console.warn("[orderWorkflow] handover step crashed (non-blocking):", he);
        }

        if (bookings && bookings.length > 0) {
          // Wave 45 D3: switched the auto-insert from the legacy
          // equipment_cleaning_status table to the canonical
          // cleaning_jobs ledger (Wave 41 P2).
          //
          // Wave 70.24: filter by requires_cleaning + skip
          // supplier-cleaned hire-in. Method now defaults to
          // 'dishwasher' when dishwasher_safe=true, else 'manual'.
          //
          // Idempotency key: (triggered_by_event_id, equipment_id).
          const { data: existing } = await supabase
            .from("cleaning_jobs")
            .select("equipment_id")
            .eq("triggered_by_event_id", (order as any).id);
          const taken = new Set(
            ((existing || []) as any[])
              .map((r) => r.equipment_id)
              .filter(Boolean),
          );

          // ETA placeholder: planned_end is 60 min from now.
          // The cleaning team can refine via the queue UI.
          const nowIso = new Date().toISOString();
          const oneHourLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();

          const rows = (bookings as any[])
            .filter((b) => {
              if (!b.equipment_id || taken.has(b.equipment_id)) return false;
              const eq = (b.equipment as any) || {};
              // Skip items that don't need cleaning.
              if (eq.requires_cleaning === false) return false;
              // Skip hire-in items the supplier cleans.
              if (eq.is_hire_in === true && eq.supplier_cleans === true) return false;
              return true;
            })
            .map((b) => {
              const eq = (b.equipment as any) || {};
              const method = eq.dishwasher_safe === true ? "dishwasher" : "manual";
              return {
                company_id: (order as any).company_id,
                equipment_id: b.equipment_id,
                quantity: Math.max(1, Number(b.quantity || 1)),
                method,
                status: "queued",
                triggered_by_event_id: (order as any).id,
                event_handover_id: handoverId,
                planned_start: nowIso,
                planned_end: oneHourLater,
              };
            });

          if (rows.length > 0) {
            const { error: cleanErr } = await (supabase as any)
              .from("cleaning_jobs")
              .insert(rows);
            if (cleanErr) {
              console.warn(
                "[orderWorkflow] cleaning_jobs insert failed (non-blocking):",
                cleanErr.message,
              );
            }
          }
        }
      } catch (e: any) {
        console.warn("[orderWorkflow] cleaning rows insert crashed (non-blocking):", e);
      }
    }

    // Wave 70.24 - create the 'expected' handover row when the
    // order moves to 'confirmed'. Gives the cleaning team
    // ANTICIPATION (the queue sees "Brown lunch returns at 14:00,
    // expect 80 items") instead of the previous reactive-only
    // flow. Idempotent on (company_id, order_id).
    if (newStatus === "confirmed" && (order as any).company_id) {
      try {
        const { createExpectedHandover } = await import("@/services/cleaningHandoverService");
        await createExpectedHandover(supabase as any, {
          companyId: (order as any).company_id,
          orderId: (order as any).id,
          eventDate: (order as any).event_date || null,
          eventTime: (order as any).event_time || null,
        });
      } catch (e: any) {
        console.warn("[orderWorkflow] createExpectedHandover crashed (non-blocking):", e);
      }
    }

    // Auto-deduct inventory on delivery. Flow audit Leg D P0-1: the
    // deduction service was never invoked by any production path - the
    // only caller (deliveryService.markDelivered) was dead code, so
    // every order delivered to date left zero usage transactions and
    // the COGS pipeline (Wave 9 Item 3) showed "No usage data yet"
    // forever. Wire it here so every delivered transition fires.
    // deductInventoryForOrder is idempotent via inventory_deducted_at.
    if (newStatus === "delivered" && order.company_id) {
      try {
        const { deductInventoryForOrder } = await import(
          "@/services/inventoryDeductionService"
        );
        const result = await deductInventoryForOrder(
          order.id,
          order.company_id,
          updatedBy || (order as any).user_id || "system",
        );
        if (!result.success && result.errors.length > 0) {
          console.warn("[orderWorkflow] inventory deduction errors:", result.errors);
        }
      } catch (e: any) {
        console.warn("[orderWorkflow] inventory deduction crashed (non-blocking):", e);
      }
    }

    // Auto-flip delivered -> completed once after-event window passes.
    // Flow audit Leg F P0-3: completeOrder() flips to "delivered" not
    // "completed", and there was no other auto-completion path - so
    // every order sat at delivered indefinitely, the after-sales
    // sequence (which keys on completed) never fired. Trigger a
    // delayed transition here. For now, fire it synchronously when the
    // operator explicitly marks the order completed via the dedicated
    // workflow path - separate from the auto-fire on delivery. The
    // cron path lives in /api/cron/auto-complete-delivered (added in
    // companion change).
    return { success: true, data: order };
  } catch (error: any) {
    console.error("Error updating order status:", error);
    return { success: false, error: error.message };
  }
}

export async function assignDriver(orderId: string, driverId: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .update({ assigned_driver_id: driverId })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    // In-app notification (existing behaviour). Deep-links to the
    // driver's deliveries list so they can tap straight through.
    await notificationService.createNotification({
      company_id: (data as any).company_id,
      user_id: driverId,
      recipient_id: driverId,
      title: "New Delivery Assignment",
      message: `You have been assigned to order ${data.order_number}`,
      notification_type: "driver_assigned",
      priority: "high",
      link: `/team-portal/driver/deliveries`,
      related_entity_type: "order",
      related_entity_id: orderId,
    });

    // WhatsApp the driver too. Closes the audit gap "kitchen ready ->
    // driver only gets in-app notification (none if driving)" + "driver
    // never sees order flags". Sends the headline + the special
    // handling flags so they're visible on the lock screen, not buried
    // inside the app.
    try {
      const { data: driver } = await (supabase as any)
        .from("profiles")
        .select("phone, phone_number, full_name")
        .eq("id", driverId)
        .maybeSingle();
      const driverPhone = (driver as any)?.phone || (driver as any)?.phone_number;
      if (driverPhone && data) {
        const flagLines: string[] = [];
        if ((data as any).requires_refrigeration) flagLines.push("⚠️ Needs refrigeration");
        if ((data as any).requires_two_drivers) flagLines.push("⚠️ Two-driver load");
        if ((data as any).requires_waiter) flagLines.push("⚠️ Waiter service");
        const eventDate = (data as any).event_date
          ? new Date((data as any).event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
          : "TBD";
        const venue = (data as any).venue_address
          ? String((data as any).venue_address).split(",")[0]
          : "TBD";
        const guests = (data as any).guest_count ?? "?";
        const message =
          `🚚 You have a new delivery: ${data.order_number}\n\n` +
          `📅 ${eventDate}\n` +
          `📍 ${venue}\n` +
          `👥 ${guests} guests\n` +
          (flagLines.length > 0 ? `\n${flagLines.join("\n")}\n` : "") +
          `\nOpen the driver app to acknowledge.`;
        const { whatsappIntegrationService } = await import("@/services/whatsappIntegrationService");
        await (whatsappIntegrationService as any).sendWhatsAppMessage(
          {
            to: driverPhone,
            type: "text",
            text: { body: message },
          },
          { companyId: (data as any).company_id },
        );
      }
    } catch (e) {
      console.warn("[orderWorkflow] driver WhatsApp on assign failed (non-blocking):", e);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error("Error assigning driver:", error);
    return { success: false, error: error.message };
  }
}

export async function assignChef(orderId: string, chefId: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .update({ assigned_chef_id: chefId })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    // Notify chef. Lands them on the kitchen team page so they see
    // their prep tasks for this order alongside the rest of the
    // kitchen workload.
    await notificationService.createNotification({
      company_id: (data as any).company_id,
      user_id: chefId,
      recipient_id: chefId,
      title: "New Order Assignment",
      message: `You have been assigned to prepare order ${data.order_number}`,
      notification_type: "chef_assigned",
      priority: "high",
      link: `/team-portal/kitchen/prep-list`,
      related_entity_type: "order",
      related_entity_id: orderId,
    });

    return { success: true, data };
  } catch (error: any) {
    console.error("Error assigning chef:", error);
    return { success: false, error: error.message };
  }
}

export async function confirmOrder(orderId: string) {
  const result = await updateOrderStatus(orderId, "confirmed");
  // Phase 1 kitchen flywheel: auto-generate backwards-planned prep tasks the
  // moment an order is confirmed. The service is idempotent and silently
  // skips when auto_generate_prep_tasks is disabled per tenant. Failure here
  // never blocks the confirm - the kitchen page will surface "no plan yet"
  // and an admin can regenerate if needed.
  try {
    const { data } = await supabase
      .from("orders").select("company_id").eq("id", orderId).is("deleted_at", null).maybeSingle();
    const companyId = (data as any)?.company_id;
    if (companyId) {
      const { kitchenPrepService } = await import("../kitchenPrepService");
      await kitchenPrepService.ensurePrepTasksForOrder(companyId, orderId);
    }
  } catch (e) {
    console.warn("Could not auto-generate prep tasks at confirm:", e);
  }
  return result;
}

export async function startPreparation(orderId: string) {
  return updateOrderStatus(orderId, "preparing");
}

export async function markOrderReady(orderId: string) {
  return updateOrderStatus(orderId, "ready");
}

export async function startDelivery(orderId: string) {
  // Canonical "truck rolling" status is in_transit. Audit (May 2026)
  // removed the parallel out_for_delivery branch - the DB enum has
  // no such value and every prior write was silently rejected.
  return updateOrderStatus(orderId, "in_transit");
}

export async function completeOrder(orderId: string) {
  return updateOrderStatus(orderId, "delivered");
}

/**
 * Cancel an order with the full cascade: stamp who/when, release booked
 * resources, and let the existing status-notification fan-out handle
 * comms via the updateOrderStatus call path's caller.
 *
 * Cascades, fire-and-forget (a failed cascade doesn't undo the cancel):
 *   - equipment_bookings linked to this order -> status='cancelled'
 *   - kitchen_prep_tasks linked to this order -> status='cancelled'
 *   - assigned_driver_id, assigned_chef_id, assigned_vehicle_id -> null
 *
 * Audit:
 *   - cancelled_at, cancelled_by_user_id, cancellation_reason,
 *     cancellation_reason_category written on the order row
 *   - order_status_history row written by updateOrderStatus path
 */
export async function cancelOrder(
  orderId: string,
  opts: {
    reason?: string;
    reason_category?: string;
    cancelled_by_user_id?: string;
    /**
     * Server-side callers (Next.js API routes) MUST pass an SSR
     * Supabase client here - the imported browser client has no
     * cookie/session in that context and RLS will reject the UPDATE
     * with "permission denied for table orders". Browser callers
     * can omit this and the default browser client picks up the
     * user's session automatically.
     */
    client?: any;
    /**
     * Wave 70.49g - when true, suppress sendStatusNotifications().
     * The smoke harness uses this so a smoke cancel doesn't ping
     * every admin in the company with "SMOKE-* cancelled"
     * notifications. The release cascade itself still runs and the
     * audit log still records the cancel; only the
     * notification fan-out is skipped. Real callers (cancel API,
     * cancellation-review) leave it false / undefined so production
     * cancels notify normally.
     */
    silent?: boolean;
  } = {},
) {
  try {
    const nowIso = new Date().toISOString();
    const sb = opts.client || supabase;

    // State-machine guard, mirrored from updateOrderStatus [P1-12].
    // cancelOrder writes status='cancelled' directly without going
    // through updateOrderStatus's transition map, so the validation
    // is duplicated here. Reject if the current status is already
    // terminal (cancelled / completed) - those should be handled
    // via reactivate / refund flows, not a fresh cancellation. Also
    // bail early if already cancelled (idempotency).
    const { data: current, error: currentErr2 } = await sb
      .from("orders")
      .select("status, company_id, user_id")
      .eq("id", orderId)
      .maybeSingle();
    if (currentErr2) {
      console.error("[order/orderWorkflow] orders fetch failed:", currentErr2);
    }
    const currentStatus = (current as any)?.status as string | null | undefined;
    const orderCompanyId = (current as any)?.company_id as string | null | undefined;
    const orderUserId = (current as any)?.user_id as string | null | undefined;
    if (currentStatus === "cancelled") {
      return { success: true, data: { id: orderId, _idempotent: true } };
    }
    if (currentStatus === "completed") {
      return {
        success: false,
        error: "Cannot cancel a completed order. Issue a refund or credit note instead.",
      };
    }
    // Phase 3 #6: shared source-status allowlist. Catches edge cases
    // the old per-function guard didn't (delivered orders, unknown
    // legacy statuses, NULL statuses on imported rows).
    if (currentStatus && !ALLOWED_CANCEL_FROM.has(currentStatus)) {
      return {
        success: false,
        error: `Cannot cancel an order with status '${currentStatus}'. Allowed sources: ${Array.from(ALLOWED_CANCEL_FROM).join(", ")}.`,
      };
    }

    const { data, error } = await sb
      .from("orders")
      .update({
        status: "cancelled",
        cancellation_reason: opts.reason || null,
        cancellation_reason_category: opts.reason_category || null,
        cancelled_at: nowIso,
        cancelled_by_user_id: opts.cancelled_by_user_id || null,
        // Resource release on the same UPDATE so kitchen / driver views
        // stop showing the order against them immediately.
        assigned_driver_id: null,
        assigned_chef_id: null,
        assigned_vehicle_id: null,
      } as any)
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    // Wave 70.48 - centralised resource release. The cascade that used
    // to live inline here (equipment_bookings, kitchen_prep_tasks,
    // inventory reversal, invoice void, outgoing_email_queue cancel,
    // outsource_assignments, cleaning_event_handover) now lives in
    // releaseOrderResources(). Why we changed:
    //   - Adding new resources to release (driver_assignments,
    //     equipment_hire_orders, shopping_list_items - coming in
    //     waves 70.49-70.51) used to require touching this function,
    //     the postpone branch in cancellation-review.ts, and the
    //     magic-link cancel path - three copies in sync.
    //   - The release receipt returned by the helper is now audit-
    //     logged so we can see EXACTLY what was released for any
    //     given cancellation (vs grepping multiple console.warns).
    //   - The helper runs sequentially (not fire-and-forget) so the
    //     order_cancelled audit log can include the full receipt.
    //     Each individual resource still tolerates its own failure
    //     without unwinding siblings - the helper catches per-resource.
    const { releaseOrderResources } = await import("./releaseResources");
    const releaseReceipt = await releaseOrderResources({
      orderId,
      companyId: orderCompanyId,
      actorUserId: opts.cancelled_by_user_id || orderUserId || null,
      mode: "cancel",
      sb,
    });

    // order_status_history row + notification fan-out happens via the
    // status-update side-effect block fed below by callers that go
    // through updateOrderStatus. cancelOrder writes directly so we
    // mirror the audit log inline.
    try {
      await sb.from("order_status_history").insert({
        order_id: orderId,
        status: "cancelled",
        changed_by: opts.cancelled_by_user_id || null,
        notes: opts.reason
          ? `Cancelled: ${opts.reason_category || "other"} - ${opts.reason}`
          : `Cancelled: ${opts.reason_category || "other"}`,
      } as any);
      // Wave 11 #12 + Wave 70.48: cross-cutting audit row. Now also
      // carries the full release receipt so the audit feed shows
      // EXACTLY which downstream resources were touched (counts +
      // per-resource success/failure). Replaces having to grep three
      // separate console.warns to see what cancelled vs what stuck.
      if (orderCompanyId) {
        await (sb as any).from("audit_logs").insert({
          company_id: orderCompanyId,
          user_id: opts.cancelled_by_user_id || null,
          action: "order_cancelled",
          entity_type: "order",
          entity_id: orderId,
          details: {
            from_status: currentStatus,
            reason_category: opts.reason_category || null,
            reason: opts.reason || null,
            release_receipt: releaseReceipt,
          },
        });
      }
    } catch (e) {
      console.warn("[cancelOrder] status history insert failed:", e);
    }

    // Run the existing notification fan-out for the cancelled status.
    // Wave 70.49g - skipped when opts.silent is true (smoke harness uses
    // this so cancelling a SMOKE-* order doesn't ping every admin in
    // the company with a notification).
    if (!opts.silent) {
      try {
        await sendStatusNotifications(data);
      } catch (e) {
        console.warn("[cancelOrder] notifications failed:", e);
      }
    }

    // Wave 70.48 - the cleaning_event_handover cancel previously lived
    // inline here as a separate try/catch. It now runs inside the
    // releaseOrderResources() helper above, so removing the duplicate
    // call. The helper records the cancel in releaseReceipt.lines
    // alongside every other cascade so the audit trail is complete.

    // Wave 70.49 - return the release receipt alongside the order so
    // API callers (the cancel.ts endpoint -> CancelOrderDialog) can
    // surface "N manual follow-ups required" to the operator without
    // a second round-trip to read audit_logs. Existing callers that
    // only consume {success, data} ignore the extra field.
    return { success: true, data, release_receipt: releaseReceipt };
  } catch (error: any) {
    console.error("Error cancelling order:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Pause an active order. Triggered when the client phones to say
 * "we might still go ahead, hold tight" - distinct from cancel
 * because the trajectory is still alive. Mirrors cancelOrder's
 * discipline (atomic status flip + cascades + audit + notifications)
 * but everything is reversible via resumeOrder.
 *
 * Side effects:
 *   - orders.status = 'paused', paused_at, paused_by_user_id,
 *     paused_reason, paused_reason_category, paused_from_status,
 *     paused_expected_resume_date stamped on the order
 *   - outgoing_email_queue: pending sends for this order flipped to
 *     'paused' so the cron skips them. Restored on resume.
 *   - kitchen_prep_tasks: pending/in_progress tasks soft-deleted
 *     (deleted_at = NOW). Kitchen views filter on deleted_at IS NULL
 *     so chefs don't see ghost tasks. Restored on resume.
 *   - order_status_history row written inline
 *   - sendStatusNotifications runs so the team's dashboards refresh
 *
 * Deposit handling: invoice is left as-is. If no payment had been
 * made the operator can void manually; if a deposit was paid we
 * preserve it. Pause is reversible - voiding eagerly would be
 * destructive.
 */
export async function pauseOrder(
  orderId: string,
  opts: {
    reason?: string;
    reason_category?: string;
    paused_by_user_id?: string;
    expected_resume_date?: string | null;
    /** SSR Supabase client for API-route callers, see cancelOrder. */
    client?: any;
  } = {},
) {
  try {
    const sb = opts.client || supabase;
    const nowIso = new Date().toISOString();

    // Snapshot the current status so resume returns to exactly the
    // state we paused from. Without this, resume would have to guess
    // (back to confirmed? to preparing? to ready?).
    const { data: existing, error: readErr } = await sb
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();
    if (readErr) throw readErr;
    if ((existing as any).status === "paused") {
      return { success: false, error: "Order is already paused." };
    }
    if ((existing as any).status === "cancelled" || (existing as any).status === "completed") {
      return { success: false, error: "Cannot pause a cancelled or completed order." };
    }
    // Phase 3 #6: source-status allowlist. Pausing a delivered or
    // in-transit order makes no operational sense - the food is out
    // the door, the driver needs a decisive call. Hard refuse.
    if ((existing as any).status && !ALLOWED_PAUSE_FROM.has((existing as any).status)) {
      return {
        success: false,
        error: `Cannot pause an order with status '${(existing as any).status}'. Use cancel instead for post-event recovery.`,
      };
    }
    const fromStatus = (existing as any).status;

    const { data, error } = await sb
      .from("orders")
      .update({
        status: "paused",
        paused_at: nowIso,
        paused_by_user_id: opts.paused_by_user_id || null,
        paused_reason: opts.reason || null,
        paused_reason_category: opts.reason_category || null,
        paused_from_status: fromStatus,
        paused_expected_resume_date: opts.expected_resume_date || null,
      } as any)
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;

    // Pause the email queue. Cron filters on status='queued' so a
    // 'paused' row is inert until we flip it back. paused_at lets
    // us audit how long sends sat on hold.
    // (Wave 70.49j fix: this used to filter on 'pending' and write
    // 'paused', but neither was in the CHECK constraint - pause was
    // a no-op for years. CHECK extended in migration
    // 20260518720000.)
    // TIGHTEN I.33: dropped the .in("trigger_event", ["aftersales",
    // "pre_event"]) filter. Pre-fix only those two trigger events
    // were paused; other auto-emails for this order (balance
    // reminders, confirmation re-sends, anything scheduled future)
    // kept firing while the order was paused, which contradicted the
    // operator's "hold tight" intent. Cancel already pauses every
    // queued auto-email for the order regardless of trigger_event;
    // pause now mirrors that breadth but with the paused status so
    // resume can restore them.
    void (async () => {
      try {
        await sb
          .from("outgoing_email_queue")
          .update({ status: "paused", paused_at: nowIso } as any)
          .eq("trigger_ref_id", orderId)
          .eq("status", "queued");
      } catch (e) {
        console.warn("[pauseOrder] email queue pause failed:", e);
      }
    })();

    // Soft-delete kitchen prep tasks. The kitchen page already
    // filters `deleted_at IS NULL` so paused tasks vanish from
    // chef views. Resume sets deleted_at back to NULL.
    void (async () => {
      try {
        await sb
          .from("kitchen_prep_tasks")
          .update({ deleted_at: nowIso } as any)
          .eq("order_id", orderId)
          .in("status", ["pending", "in_progress"])
          .is("deleted_at", null);
      } catch (e) {
        console.warn("[pauseOrder] kitchen prep pause failed:", e);
      }
    })();

    // Inline audit log - mirrors cancelOrder's pattern.
    try {
      await sb.from("order_status_history").insert({
        order_id: orderId,
        status: "paused",
        changed_by: opts.paused_by_user_id || null,
        notes: opts.reason
          ? `Paused from ${fromStatus}: ${opts.reason_category || "other"} - ${opts.reason}`
          : `Paused from ${fromStatus}: ${opts.reason_category || "other"}`,
      } as any);
    } catch (e) {
      console.warn("[pauseOrder] status history insert failed:", e);
    }

    try {
      await sendStatusNotifications(data);
    } catch (e) {
      console.warn("[pauseOrder] notifications failed:", e);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error("Error pausing order:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Resume a paused order. Reverses the pauseOrder cascades:
 * un-pauses the email queue, restores soft-deleted prep tasks,
 * stamps an audit log row, and returns the order to whichever
 * status it was paused from (typically 'confirmed').
 */
export async function resumeOrder(
  orderId: string,
  opts: {
    resumed_by_user_id?: string;
    client?: any;
  } = {},
) {
  try {
    const sb = opts.client || supabase;
    const nowIso = new Date().toISOString();

    const { data: existing, error: readErr } = await sb
      .from("orders")
      .select("status, paused_from_status")
      .eq("id", orderId)
      .single();
    if (readErr) throw readErr;
    if (!ALLOWED_RESUME_FROM.has((existing as any).status)) {
      return {
        success: false,
        error: `Order is not paused (status='${(existing as any).status}'). Nothing to resume.`,
      };
    }
    // Default back to 'confirmed' if paused_from_status is somehow
    // missing (legacy paused orders pre-this-migration).
    const restoreTo = (existing as any).paused_from_status || "confirmed";

    // Defensive confirmed_at backfill: if the order is resuming into
    // a past-pending status and has no confirmed_at stamped (legacy
    // row), set one now so downstream tiles count it correctly. Never
    // clobber an existing timestamp.
    const advancedStatuses = new Set([
      "confirmed", "preparing", "ready", "in_transit",
      "delivered", "completed",
    ]);
    const updates: any = {
      status: restoreTo,
      paused_at: null,
      paused_by_user_id: null,
      paused_reason: null,
      paused_reason_category: null,
      paused_from_status: null,
      paused_expected_resume_date: null,
    };
    if (advancedStatuses.has(restoreTo) && !(existing as any).confirmed_at) {
      updates.confirmed_at = new Date().toISOString();
    }

    const { data, error } = await sb
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;

    // Un-pause the email queue. Anything still scheduled for the
    // future fires when its scheduled_for time arrives.
    // (Wave 70.49j fix: this used to write 'pending', which wasn't
    // in the CHECK constraint. Now writes 'queued' to match the
    // canonical claimable state.)
    void (async () => {
      try {
        await sb
          .from("outgoing_email_queue")
          .update({ status: "queued", paused_at: null } as any)
          .eq("trigger_ref_id", orderId)
          .eq("status", "paused");
      } catch (e) {
        console.warn("[resumeOrder] email queue resume failed:", e);
      }
    })();

    // Restore prep tasks. Only un-soft-deletes tasks that were
    // pending/in_progress - completed and cancelled stay where
    // they are (history is sacred).
    void (async () => {
      try {
        await sb
          .from("kitchen_prep_tasks")
          .update({ deleted_at: null } as any)
          .eq("order_id", orderId)
          .in("status", ["pending", "in_progress"])
          .not("deleted_at", "is", null);
      } catch (e) {
        console.warn("[resumeOrder] kitchen prep resume failed:", e);
      }
    })();

    try {
      await sb.from("order_status_history").insert({
        order_id: orderId,
        status: restoreTo,
        changed_by: opts.resumed_by_user_id || null,
        notes: `Resumed from paused - back to ${restoreTo}`,
      } as any);
    } catch (e) {
      console.warn("[resumeOrder] status history insert failed:", e);
    }

    try {
      await sendStatusNotifications(data);
    } catch (e) {
      console.warn("[resumeOrder] notifications failed:", e);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error("Error resuming order:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Status notification fan-out. Audit (May 2026) flagged that we only
 * pinged on confirmed / ready / delivered, leaving four blind spots
 * (preparing, in_transit, completed, cancelled) where the client and
 * the team could go silent on each other. This rewrite covers every
 * status change with role-appropriate messages on every channel.
 *
 * Quarantine-aware: imported orders with comms_paused_until in the
 * future skip every customer-facing channel. Internal in-app
 * notifications still fire so the team has visibility on the
 * imported order's lifecycle.
 *
 * Per-channel try/catch so one failing channel (no provider, expired
 * Resend key, missing phone) doesn't suppress the others.
 */
async function sendStatusNotifications(order: any) {
  const status = String(order.status || "").toLowerCase();
  const orderNumber = order.order_number || `#${String(order.id || "").slice(0, 8)}`;
  const clientFirstName = String(order.client_name || "").trim().split(" ")[0] || "there";
  const eventDateLabel = order.event_date
    ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })
    : "";
  const venueShort = order.venue_address
    ? String(order.venue_address).split(",")[0]
    : "";
  // Tenant display name for the new preparing/ready client comms.
  // Lifted out so we look it up once per status change instead of
  // per-channel. Best-effort - a missing row falls back to a
  // neutral phrase in the email body.
  let tenantName = "Your catering team";
  if (order.company_id) {
    try {
      const { data: company } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", order.company_id)
        .maybeSingle();
      if ((company as any)?.company_name) tenantName = (company as any).company_name;
    } catch (e) {
      console.warn("[sendStatusNotifications] tenant lookup failed:", e);
    }
  }
  const eventName = order.event_name || `your ${orderNumber} order`;

  // Quarantine: an imported order with paused comms gets in-app
  // visibility but no customer-facing email/WhatsApp until the owner
  // green-lights the batch.
  const isCommsPaused = !!order.comms_paused_until && new Date(order.comms_paused_until) > new Date();

  // Resolve the client's auth uid ONCE up front. orders.client_id is a FK
  // to clients.id, NOT auth.users.id - pushing it as recipient_id silently
  // drops the notification (no auth user reads it). If this returns null
  // we skip every client-facing in-app push below; the email + WhatsApp
  // paths are unaffected because they use clientEmail / clientPhone.
  let clientAuthUid: string | null = null;
  if (order.client_id) {
    try {
      clientAuthUid = await resolveClientUserId(supabase, order.client_id);
      if (!clientAuthUid) {
        console.warn(
          `[sendStatusNotifications] no auth uid for client_id=${order.client_id} on order ${orderNumber}; skipping in-app client pushes`,
        );
      }
    } catch (e) {
      console.warn("[sendStatusNotifications] resolveClientUserId failed:", e);
    }
  }

  // 1. In-app notifications - always fire (admin + driver + client).
  // Each row gets a deep-link (`link`) AND a related_entity pointer so
  // the bell + notifications page can render contextual CTAs that jump
  // straight to the order. Admin pushes go to /admin/orders?orderId=...
  // (the dashboard responds to the query param), drivers go to their
  // delivery list, clients go to /client-portal/my-orders. No more
  // generic dashboards on click.
  type InAppPush = {
    recipient_id: string;
    title: string;
    message: string;
    notification_type: string;
    notification_kind: "admin" | "driver" | "client";
    priority?: string;
  };
  const inApp: InAppPush[] = [];
  const adminLink = `/order/${order.id}?role=admin`;
  // ODOC G.6 Wave 2: drivers + clients now land on the unified doc
  // too. Doc accepts role hint and renders the correct section
  // auto-expanded. Driver dashboard is still the POD capture host
  // (the doc's button deep-links there).
  const driverLink = `/order/${order.id}?role=driver`;
  const clientLink = `/order/${order.id}?role=client`;

  switch (status) {
    case "confirmed":
      if (clientAuthUid) {
        inApp.push({
          recipient_id: clientAuthUid,
          title: "Order confirmed",
          message: `Your order ${orderNumber} is locked in${eventDateLabel ? ` for ${eventDateLabel}` : ""}.`,
          notification_type: "order_confirmed",
          notification_kind: "client",
        });
      }
      // Role-fanout: tell the kitchen team an order is in for them.
      // Audit Notif G1 - the kitchen inbox at
      // /team-portal/kitchen/notifications had no producer anywhere,
      // so non-assigned chefs were blind to incoming orders. Fan-out
      // to the whole kitchen_staff role for this company so anyone
      // on shift can see the new booking even if a specific chef
      // hasn't been assigned yet via the order's assigned_chef_id.
      // Non-blocking, await is short-circuited via void.
      if (order.company_id) {
        void notificationService.broadcastNotification({
          companyId: order.company_id,
          regionId: (order as any).region_id || null,
          targetRoles: ["kitchen_staff" as any, "chef" as any],
          title: "New confirmed order",
          message: `Order ${orderNumber} confirmed${eventDateLabel ? ` for ${eventDateLabel}` : ""}. Prep tasks have been scheduled.`,
          type: "order_confirmed",
          priority: "normal",
          link: `/team-portal/kitchen/prep-list?orderId=${order.id}`,
          relatedEntityType: "order",
          relatedEntityId: order.id,
        }).catch((e) => {
          console.warn("[sendStatusNotifications] kitchen broadcast failed:", e);
        });

        // Bobby's brief: drivers had no notification path when a new
        // claimable order landed. AvailableJobsCard polls every 60s
        // and subscribes to postgres_changes, but a driver only sees
        // it if they're already on the dashboard. Broadcast to every
        // driver in the region the moment the order is confirmed
        // AND still unassigned. The link drops the driver on
        // /team-portal/driver/dashboard where AvailableJobsCard
        // surfaces the same order with the Claim button + the
        // confirm dialog (#173) that walks them through the details
        // before committing.
        //
        // Dedup on (companyId, order id, type) within a 24h window
        // so a cancel-then-re-confirm flip doesn't double-blast.
        // Region scoped so a CPT confirm doesn't ping JHB drivers.
        const orderHasDriver =
          (order as any).assigned_driver_id || (order as any).driver_id;
        if (!orderHasDriver) {
          void notificationService.broadcastNotification({
            companyId: order.company_id,
            regionId: (order as any).region_id || null,
            targetRoles: ["driver" as any],
            title: "New job to claim",
            message: `Order ${orderNumber}${eventDateLabel ? ` on ${eventDateLabel}` : ""}${venueShort ? ` to ${venueShort}` : ""}. Tap to open and claim before another driver does.`,
            type: "new_job_available",
            priority: "high",
            link: "/team-portal/driver/dashboard",
            relatedEntityType: "order",
            relatedEntityId: order.id,
            dedup: true,
            dedupWindowMinutes: 60 * 24,
          }).catch((e) => {
            console.warn("[sendStatusNotifications] driver job-available broadcast failed:", e);
          });
        }
      }
      break;
    case "preparing":
      if (order.user_id) {
        inApp.push({
          recipient_id: order.user_id,
          title: "Kitchen prep started",
          message: `Order ${orderNumber} is now in prep.`,
          notification_type: "order_preparing",
          notification_kind: "admin",
        });
      }
      // Client-facing reassurance push. Audit gap: today the client
      // hears nothing between confirmed and in_transit, so they
      // don't know the kitchen is on the case.
      if (clientAuthUid) {
        inApp.push({
          recipient_id: clientAuthUid,
          title: `We're prepping your ${eventName} order`,
          message: `${tenantName} has started prep${eventDateLabel ? ` for your ${eventDateLabel} event` : ""}. We'll let you know when it's on the way.`,
          notification_type: "order_preparing",
          notification_kind: "client",
        });
      }
      break;
    case "ready":
      if (order.assigned_driver_id) {
        inApp.push({
          recipient_id: order.assigned_driver_id,
          title: "Pickup ready",
          message: `Order ${orderNumber} is ready for collection from the kitchen.`,
          notification_type: "order_ready",
          notification_kind: "driver",
          priority: "high",
        });
      }
      if (order.user_id) {
        inApp.push({
          recipient_id: order.user_id,
          title: "Order ready - driver alerted",
          message: `Order ${orderNumber} ready, driver has been pinged.`,
          notification_type: "order_ready",
          notification_kind: "admin",
        });
      }
      // Client-facing push so they know prep is done and dispatch is
      // next - closes the second silent moment before in_transit.
      if (clientAuthUid) {
        inApp.push({
          recipient_id: clientAuthUid,
          title: `Your ${eventName} order is ready`,
          message: `${tenantName} has finished prep. Driver will pick up shortly and we'll send tracking details once they're rolling.`,
          notification_type: "order_ready",
          notification_kind: "client",
        });
      }
      // Multi-ready cluster alert. When 2+ orders hit ready inside
      // a 30-minute window, dispatch needs to coordinate - without
      // this, the kitchen can have 3 hot meals waiting while a
      // single driver wonders which to grab first. Counts the
      // current order's company by status='ready' updated in the
      // last 30m; an `>= 2` result fires the cluster alert.
      if (order.company_id && order.user_id) {
        try {
          const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const { count: readyCount } = await (supabase as any)
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("company_id", order.company_id)
            .eq("status", "ready")
            .gte("updated_at", since)
            .is("deleted_at", null);
          if (typeof readyCount === "number" && readyCount >= 2) {
            inApp.push({
              recipient_id: order.user_id,
              title: `🔥 ${readyCount} orders ready - coordinate dispatch`,
              message: `Multiple orders are sitting ready in the last 30 min. Open the dispatch queue to assign drivers before food cools.`,
              notification_type: "dispatch_cluster",
              notification_kind: "admin",
              priority: "urgent",
            });
          }
        } catch (e) {
          console.warn("[sendStatusNotifications] cluster check failed:", e);
        }
      }
      break;
    case "in_transit":
      if (clientAuthUid) {
        inApp.push({
          recipient_id: clientAuthUid,
          title: "Driver on the way",
          message: `Your order ${orderNumber} is on its way${venueShort ? ` to ${venueShort}` : ""}.`,
          notification_type: "out_for_delivery",
          notification_kind: "client",
          priority: "high",
        });
      }
      break;
    case "delivered":
      if (clientAuthUid) {
        inApp.push({
          recipient_id: clientAuthUid,
          title: "Order delivered",
          message: `Your order ${orderNumber} has been delivered. Enjoy!`,
          notification_type: "delivered",
          notification_kind: "client",
        });
      }
      if (order.user_id) {
        inApp.push({
          recipient_id: order.user_id,
          title: "Delivered",
          message: `Order ${orderNumber} delivered.`,
          notification_type: "delivered",
          notification_kind: "admin",
        });
      }
      // Role-fanout: tell the cleaning team they have equipment
      // coming back from this event. The cleaning_status rows were
      // just inserted by the writer in updateOrderStatus, so this
      // broadcast is the inbox ping that says "go look".
      // Audit Notif G1 - cleaning team had no producer.
      if (order.company_id) {
        void notificationService.broadcastNotification({
          companyId: order.company_id,
          regionId: (order as any).region_id || null,
          targetRoles: ["cleaning_staff" as any],
          title: "Equipment ready for cleaning",
          message: `Event for order ${orderNumber} just delivered. Equipment will be returning - check the cleaning board.`,
          type: "cleaning_required",
          priority: "normal",
          link: `/team-portal/cleaning/dashboard?orderId=${order.id}`,
          relatedEntityType: "order",
          relatedEntityId: order.id,
        }).catch((e) => {
          console.warn("[sendStatusNotifications] cleaning broadcast failed:", e);
        });
      }
      break;
    case "completed":
      if (order.user_id) {
        inApp.push({
          recipient_id: order.user_id,
          title: "Order closed out",
          message: `Order ${orderNumber} is fully paid and complete.`,
          notification_type: "order_completed",
          notification_kind: "admin",
        });
      }
      break;
    case "cancelled":
      if (clientAuthUid) {
        inApp.push({
          recipient_id: clientAuthUid,
          title: "Order cancelled",
          message: `Your order ${orderNumber} has been cancelled. Please get in touch with us if this is unexpected.`,
          notification_type: "order_cancelled",
          notification_kind: "client",
          priority: "high",
        });
      }
      if (order.user_id) {
        inApp.push({
          recipient_id: order.user_id,
          title: "Order cancelled",
          message: `Order ${orderNumber} cancelled.`,
          notification_type: "order_cancelled",
          notification_kind: "admin",
        });
      }
      break;
  }
  // Wave 24: track whether the CLIENT in-app push was deduped. The
  // email branch below fires once per status to the client; if the
  // notification dedup hit, it means another invocation already
  // fired (which would also have fired this email), so we skip the
  // email too. Without this, in-app dedup catches the duplicate
  // notification but the client still gets two identical emails.
  let clientInAppDeduped = false;
  let clientInAppFired = false;

  for (const n of inApp) {
    try {
      const link =
        n.notification_kind === "driver"
          ? driverLink
          : n.notification_kind === "client"
          ? clientLink
          : adminLink;
      // Wave 24: dedup with a SHORT 5-min window. Status flips have
      // a real misfire surface: the auto-complete cron, the dispatch
      // service, the kitchen-task completion handler, and a manual
      // operator status update can race within seconds of each other.
      // Each path independently calls updateOrderStatus -> this
      // function -> creates a notification per recipient. Without
      // dedup the client sees "Order ready" three times in 30s.
      // 5-min window catches the retry storm cleanly while letting a
      // legitimate "preparing -> ready -> preparing -> ready" cycle
      // (rare but real - chef pulled meat early, sent it back) ping
      // the recipient again on the second arrival at ready. Longer
      // window (60min) used for review handlers because a double-
      // click there would otherwise duplicate, and review cycles
      // don't legitimately repeat that fast.
      const created = await notificationService.createNotification({
        company_id: order.company_id,
        recipient_id: n.recipient_id,
        user_id: n.recipient_id,
        notification_type: n.notification_type,
        title: n.title,
        message: n.message,
        priority: n.priority || "normal",
        link,
        related_entity_type: "order",
        related_entity_id: order.id,
        dedup: true,
        dedupWindowMinutes: 5,
      });
      // createNotification returns null when the dedup probe hit.
      // Track the client-recipient outcome so the email branch can
      // mirror it.
      if (n.notification_kind === "client") {
        if (created === null) clientInAppDeduped = true;
        else clientInAppFired = true;
      }
    } catch (e) {
      console.warn("[sendStatusNotifications] in-app push failed:", e);
    }
  }

  // 2. Customer-facing email. Skip if quarantined or no email on file.
  // Each status routes through the centralised resolver - tenant
  // override beats global default beats the inline fallback. The
  // hardcoded fallback strings here are also the source for the seed
  // migration so what an operator first sees in the editor matches
  // what their clients have been receiving.
  if (!isCommsPaused && order.client_email && order.user_id) {
    type StatusFallback = {
      templateType: string;
      subject: string;
      body: string;
    } | null;
    const etaSentence = buildEtaSentence(order);
    const customerEmailFor: Record<string, StatusFallback> = {
      confirmed: {
        templateType: "order_confirmed",
        subject: `Order confirmed - ${orderNumber}`,
        body:
          `Hi {{first_name}},\n\n` +
          `Your order {{order_number}}{{event_date_phrase}} is confirmed. ` +
          `We'll be in touch closer to the day with the final headcount and any last tweaks.\n\n` +
          `Thanks for booking with us.`,
      },
      // Audit gap closure: prepping + ready used to be silent for the
      // client. Short, reassuring copy so the inbox doesn't get noisy
      // but the client knows the kitchen is moving.
      preparing: {
        templateType: "order_preparing",
        subject: `We're prepping your {{event_name}} order`,
        body:
          `Hi {{first_name}},\n\n` +
          `{{tenant_name}} has started prep{{event_date_phrase}}. ` +
          `We'll let you know when it's on the way.\n\n` +
          `Thanks,\n{{tenant_name}}`,
      },
      ready: {
        templateType: "order_ready",
        subject: `Your {{event_name}} order is ready`,
        body:
          `Hi {{first_name}},\n\n` +
          `{{tenant_name}} has finished prep. Driver will pick up shortly and we'll send tracking details once they're rolling.\n\n` +
          `Thanks,\n{{tenant_name}}`,
      },
      in_transit: {
        templateType: "order_in_transit",
        subject: `On the way - {{order_number}}`,
        body:
          `Hi {{first_name}},\n\n` +
          `Good news - your order {{order_number}} has just left the kitchen and is on its way{{venue_phrase}}. ` +
          `{{eta_sentence}}` +
          `\n\nReply to this email if anything changes on your side.`,
      },
      delivered: {
        templateType: "order_delivered",
        subject: `Delivered - {{order_number}}`,
        body:
          `Hi {{first_name}},\n\n` +
          `Your order {{order_number}} has been delivered. We hope it lands the way you hoped!\n\n` +
          `If anything wasn't quite right, please reply - we read every email and we'd rather hear it.`,
      },
      completed: null,
      // The cancellation email is sent by sendCancellationEmail() from
      // the cancel API endpoint with the actual refund amount included.
      // Skipping here so the client doesn't get two emails.
      cancelled: null,
    };
    const tpl = customerEmailFor[status];
    // Wave 24: skip the email when the in-app push for the client
    // recipient was deduped. clientInAppDeduped flips to true when
    // a prior call already pushed the same status notification at
    // this client recently (5-min window). We mirror the outcome so
    // the email branch doesn't double-fire when the in-app dedup
    // would otherwise be the only signal of suppression. The
    // clientInAppFired guard handles the case where there was no
    // client in-app push to gate against (e.g. transitions where
    // the inApp array doesn't include a client entry); in that case
    // we let the email send through unconditionally.
    if (tpl && !(clientInAppDeduped && !clientInAppFired)) {
      try {
        const variables: Record<string, string> = {
          first_name: clientFirstName,
          client_first_name: clientFirstName,
          order_number: orderNumber,
          event_name: eventName,
          tenant_name: tenantName,
          event_date_label: eventDateLabel,
          event_date_phrase: eventDateLabel ? ` for ${eventDateLabel}` : "",
          venue_phrase: venueShort ? ` to ${venueShort}` : "",
          venue_short: venueShort,
          eta_sentence: etaSentence,
        };
        const resolved = await resolveEmailTemplate({
          companyId: order.company_id || order.user_id,
          templateType: tpl.templateType,
          variables,
          fallback: { subject: tpl.subject, bodyHtml: tpl.body },
        });
        // Wave 24: pass the resolved client so emailService can read
        // email_provider_settings under the right auth context (the
        // module-level `supabase` is service-role on the server,
        // browser anon in the browser).
        await emailService.sendEmail({
          companyId: order.user_id,
          to: order.client_email,
          subject: resolved.subject,
          body: resolved.bodyHtml,
          _client: supabase,
        } as any);
      } catch (e) {
        console.warn("[sendStatusNotifications] customer email failed:", e);
      }
    }
  }

  // 3. Customer-facing WhatsApp - only on the high-touch transitions
  // (in_transit + delivered) where it adds a real signal beyond email.
  // Skip if quarantined / no phone.
  if (!isCommsPaused && order.client_phone && (status === "in_transit" || status === "delivered")) {
    const wa = status === "in_transit"
      ? `🚚 ${orderNumber} is on its way${venueShort ? ` to ${venueShort}` : ""}. ${buildEtaSentence(order, true)}`
      : `✅ ${orderNumber} delivered. Hope it goes brilliantly!`;
    try {
      await whatsappIntegrationService.sendWhatsAppMessage(
        {
          to: order.client_phone,
          type: "text",
          text: { body: wa },
        } as any,
        { companyId: (order as any).company_id },
      );
    } catch (e) {
      console.warn("[sendStatusNotifications] customer whatsapp failed:", e);
    }
  }
}

/**
 * ETA sentence for "driver is on the way" comms. Uses
 * delivery_duration_minutes if a route was optimised, otherwise
 * falls back to a flat "shortly" so we don't quote false numbers.
 * The terse=true variant is for WhatsApp (no extra formatting).
 */
function buildEtaSentence(order: any, terse = false): string {
  const mins = Number(order.delivery_duration_minutes || 0);
  if (mins > 0 && mins < 240) {
    return terse ? `ETA ~${mins} min.` : `Estimated arrival in about ${mins} minutes.`;
  }
  return terse ? "Arriving shortly." : "We'll be with you shortly.";
}

export async function getOrderStatusHistory(orderId: string) {
  try {
    const { data, error } = await supabase
      .from("order_status_history")
      .select(`
        *,
        changed_by_profile:profiles!order_status_history_changed_by_fkey(full_name, email)
      `)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("Error fetching order status history:", error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Persist after-sales follow-ups into outgoing_email_queue for the
 * cron worker to dispatch. Idempotent: skips if the queue already
 * has scheduled rows for this order. Skips imported / quarantined
 * orders so historical data uploaded at onboarding doesn't trigger
 * "thanks for your event" emails for events that happened years ago.
 *
 * The actual templates / monthly cadence live in
 * src/lib/afterSalesTemplates.ts. We pull the template list at
 * scheduling time and snapshot the body into the queue row - if
 * the template changes later, scheduled rows still send the wording
 * the operator approved when they ran.
 */
async function ensureScheduledAfterSales(order: any): Promise<void> {
  if (!order?.id || !order?.company_id || !order?.client_email) return;

  // Quarantine guard.
  if (order.imported_at || (order.comms_paused_until && new Date(order.comms_paused_until) > new Date())) {
    console.log(`[orderWorkflow] order ${order.id} is quarantined - skipping after-sales scheduling`);
    return;
  }

  // Idempotency: don't double-schedule.
  const { data: existing, error: existingErr2 } = await (supabase as any)
    .from("outgoing_email_queue")
    .select("id")
    .eq("trigger_event", "aftersales")
    .eq("trigger_ref_id", order.id)
    .limit(1);
  if (existingErr2) {
    console.error("[order/orderWorkflow] outgoing_email_queue fetch failed:", existingErr2);
  }
  if (existing && existing.length > 0) return;

  try {
    const { defaultAfterSalesTemplates, interpolateEmailTemplate, getEmailVariables } =
      await import("@/lib/afterSalesTemplates");
    // Wave 23.5: per-tenant cadence control. Pull the company's
    // aftersales_max_months + aftersales_skip_template_ids so the
    // scheduler honours the operator's preference. Defaults
    // (max=12, skip=[]) preserve the existing 6-email cadence so
    // tenants who never touch the new columns see no change.
    const { data: companyCadence } = await (supabase as any)
      .from("companies")
      .select("aftersales_max_months, aftersales_skip_template_ids")
      .eq("id", order.company_id)
      .maybeSingle();
    const maxMonths = Number((companyCadence as any)?.aftersales_max_months ?? 12);
    const skipIds = new Set<string>(
      ((companyCadence as any)?.aftersales_skip_template_ids as string[] | null) ?? [],
    );

    const eventDate = order.event_date ? new Date(order.event_date) : new Date();
    const variables = getEmailVariables(
      order.id,
      order.client_name || "there",
      order.event_type || "your event",
      eventDate.toISOString(),
    );

    const rows: any[] = [];
    for (const template of defaultAfterSalesTemplates) {
      if (!template.isActive) continue;
      // Per-tenant skip controls. max-months ceiling AND explicit
      // template-id list both honoured - a row that hits either
      // gets skipped.
      if ((template.monthsAfterEvent || 0) > maxMonths) continue;
      if (skipIds.has(template.id)) continue;

      const sendAt = new Date(eventDate);
      sendAt.setMonth(sendAt.getMonth() + (template.monthsAfterEvent || 0));
      // Don't schedule rows whose send-time is already in the past
      // (e.g. completing a 6-month-old order) - they'd fire all at
      // once and look like spam. The dashboard can offer a "resume"
      // path later if the operator wants to back-fill.
      if (sendAt.getTime() < Date.now() - 24 * 3600 * 1000) continue;

      // Wave 50: each after-sales row now resolves through
      // resolveEmailTemplate so the tenant's customisation in
      // /admin/messaging-templates (registry key aftersales_<id>)
      // drives the queued copy. Fallback is the same interpolated
      // string we used before so a tenant that hasn't customised
      // sees no behaviour change.
      const templateType = `aftersales_${template.id}`;
      let resolvedSubject = interpolateEmailTemplate(template.subject, variables);
      let resolvedBody = interpolateEmailTemplate(template.body, variables);
      try {
        const resolved = await resolveEmailTemplate({
          companyId: order.company_id,
          templateType,
          variables,
          fallback: { subject: template.subject, bodyHtml: template.body },
        });
        resolvedSubject = resolved.subject;
        resolvedBody = resolved.bodyHtml;
      } catch (e) {
        console.warn(`[orderWorkflow] aftersales resolveEmailTemplate failed for ${templateType}, using inline default:`, e);
      }

      rows.push({
        company_id: order.company_id,
        to_email: order.client_email,
        to_name: order.client_name || "there",
        subject: resolvedSubject,
        body: resolvedBody,
        trigger_event: "aftersales",
        trigger_ref_id: order.id,
        status: "pending",
        scheduled_for: sendAt.toISOString(),
        template_type: templateType,
        variables,
      });
    }

    if (rows.length > 0) {
      await (supabase as any).from("outgoing_email_queue").insert(rows);
    }
  } catch (e) {
    console.warn("[orderWorkflow] ensureScheduledAfterSales internal failure:", e);
  }
}

/**
 * Persist pre-event reminders into outgoing_email_queue. Two
 * reminders by default: 7 days before and 1 day before the event.
 * Idempotent + quarantine-aware, same pattern as the after-sales
 * scheduler. The cron worker dispatches them through emailService
 * which runs the block-list + quarantine gates centrally.
 *
 * Why two only? Audit feedback was that operators currently have to
 * remember to send these manually and forget half the time - two
 * automated touchpoints is the right ratio of presence to spam. The
 * lib/whatsappTemplates "event_week" / "event_day_morning" templates
 * already exist for the manual flow; if we ever want WhatsApp to
 * fire automatically too, mirror this scheduler against an
 * outgoing_whatsapp_queue (doesn't exist yet).
 */
async function ensureScheduledPreEventReminders(order: any): Promise<void> {
  if (!order?.id || !order?.company_id || !order?.client_email || !order?.event_date) return;

  // Quarantine guard.
  if (order.imported_at || (order.comms_paused_until && new Date(order.comms_paused_until) > new Date())) {
    return;
  }

  // Idempotency.
  const { data: existing, error: existingErr3 } = await (supabase as any)
    .from("outgoing_email_queue")
    .select("id")
    .eq("trigger_event", "pre_event")
    .eq("trigger_ref_id", order.id)
    .limit(1);
  if (existingErr3) {
    console.error("[order/orderWorkflow] outgoing_email_queue fetch failed:", existingErr3);
  }
  if (existing && existing.length > 0) return;

  const eventDate = new Date(order.event_date);
  const eventLabel = eventDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  const firstName = String(order.client_name || "there").trim().split(" ")[0] || "there";

  // Wave 23.5: pre-event reminder bodies used to sign off as a
  // generic "Looking forward to it" / "See you tomorrow" with no
  // sender attribution. Personalise by pulling the tenant name and
  // surface the event_name so the recipient knows which event the
  // reminder is for (a client with two bookings could otherwise
  // confuse them). Best-effort lookup - the cron worker will still
  // send a generic body if the lookup fails.
  let tenantNameForReminders = "the team";
  try {
    const { data: companyRow, error: companyRowErr } = await (supabase as any)
      .from("companies")
      .select("company_name")
      .eq("id", order.company_id)
      .maybeSingle();
    if (companyRowErr) {
      console.error("[order/orderWorkflow] companies fetch failed:", companyRowErr);
    }
    if ((companyRow as any)?.company_name) tenantNameForReminders = (companyRow as any).company_name;
  } catch {
    // fall through
  }
  const eventNameLabel = order.event_name || "your event";

  // Wave 50: each reminder now resolves through the central template
  // resolver so what the tenant edits in /admin/messaging-templates
  // is what their clients receive. Keys match registry.ts entries
  // event_one_week_reminder / event_day_before_reminder.
  const reminderDefaults = [
    {
      offsetMs: -7 * 24 * 3600 * 1000,
      key: "week_before",
      templateType: "event_one_week_reminder",
      subject: `One week to go - ${eventNameLabel} on ${eventLabel}`,
      body:
        `Hi ${firstName},\n\n` +
        `Just a friendly reminder that ${eventNameLabel} is one week away (${eventLabel}). ` +
        `If anything has changed - final headcount, menu tweaks, drop-off time - now is the perfect time to let us know.\n\n` +
        `Reply to this email or open your client portal to request a change.\n\n` +
        `Looking forward to it.\n\n${tenantNameForReminders}`,
    },
    {
      offsetMs: -1 * 24 * 3600 * 1000,
      key: "day_before",
      templateType: "event_day_before_reminder",
      subject: `Tomorrow's the day - ${eventNameLabel}`,
      body:
        `Hi ${firstName},\n\n` +
        `Quick check-in - everything is locked in for ${eventNameLabel} tomorrow. ` +
        `Final guest count + venue address are confirmed on our side. ` +
        `If anything urgent comes up between now and then, give us a ring.\n\n` +
        `See you tomorrow.\n\n${tenantNameForReminders}`,
    },
  ];

  const reminderVariables: Record<string, string> = {
    first_name: firstName,
    client_name: String(order.client_name || "there"),
    event_name: eventNameLabel,
    event_date: eventLabel,
    guest_count: String(order.guest_count ?? ""),
    venue: String(order.venue || ""),
    tenant_name: tenantNameForReminders,
    order_number: String(order.order_number || ""),
  };

  const rows: any[] = [];
  for (const r of reminderDefaults) {
    const sendAt = new Date(eventDate.getTime() + r.offsetMs);
    // Skip if the reminder time is already in the past (e.g. event
    // is 3 days away when the order gets confirmed).
    if (sendAt.getTime() < Date.now()) continue;
    // Resolve through the template editor (tenant override -> global
    // default -> inline fallback). Never throws; on failure we still
    // queue the inline default so the cron worker keeps shipping.
    let resolvedSubject = r.subject;
    let resolvedBody = r.body;
    try {
      const resolved = await resolveEmailTemplate({
        companyId: order.company_id,
        templateType: r.templateType,
        variables: reminderVariables,
        fallback: { subject: r.subject, bodyHtml: r.body },
      });
      resolvedSubject = resolved.subject;
      resolvedBody = resolved.bodyHtml;
    } catch (e) {
      console.warn("[ensureScheduledPreEventReminders] resolve failed, using inline default:", e);
    }
    rows.push({
      company_id: order.company_id,
      to_email: order.client_email,
      to_name: order.client_name || "there",
      subject: resolvedSubject,
      body: resolvedBody,
      trigger_event: "pre_event",
      trigger_ref_id: order.id,
      status: "pending",
      scheduled_for: sendAt.toISOString(),
      template_type: r.templateType,
      variables: reminderVariables,
    });
  }

  if (rows.length > 0) {
    await (supabase as any).from("outgoing_email_queue").insert(rows);
  }
}

/**
 * Wave 49 B1 - mirror order status progression onto the active
 * delivery driver_assignment row.
 *
 * Maps:
 *   in_transit  -> da.status='en_route',  da.en_route_at + da.picked_up_at
 *   delivered   -> da.status='delivered', da.delivered_at
 *   completed   -> da.status='completed', da.completed_at
 *
 * Idempotent: only writes <stamp>_at when null. Status always
 * advances forward (never backwards). Targets the delivery
 * assignment_type only - collection trips have their own status
 * progression handled by driverConfirmationService.completeCollection.
 *
 * Best-effort: a missing assignment row (admin order with no driver
 * yet) is a silent no-op rather than an error. Async errors are
 * caught by the caller and logged.
 */
async function _lockstepMirrorToDriverAssignment(
  orderId: string,
  newStatus: string,
  nowIso: string,
): Promise<void> {
  // Map the orders.status flip to the driver_assignments status enum
  // value + the column that needs stamping.
  const map: Record<string, { daStatus: string; stampColumns: string[] }> = {
    in_transit: { daStatus: "en_route", stampColumns: ["en_route_at", "picked_up_at"] },
    delivered: { daStatus: "delivered", stampColumns: ["delivered_at"] },
    completed: { daStatus: "completed", stampColumns: ["completed_at"] },
  };
  const m = map[newStatus];
  if (!m) return;

  // Find the active delivery row. We never mirror onto collection
  // (that has its own lifecycle) or returns / catering trips.
  const { data: rows, error: selErr } = await (supabase as any)
    .from("driver_assignments")
    .select("id, status, en_route_at, picked_up_at, delivered_at, completed_at")
    .eq("order_id", orderId)
    .eq("assignment_type", "delivery");

  if (selErr) {
    console.warn("[lockstepMirror] driver_assignments select failed:", selErr);
    return;
  }
  const targets = (rows as any[]) || [];
  if (targets.length === 0) return;

  for (const row of targets) {
    const updates: any = { status: m.daStatus, updated_at: nowIso };
    for (const col of m.stampColumns) {
      if (!row[col]) updates[col] = nowIso;
    }
    const { error: updErr } = await (supabase as any)
      .from("driver_assignments")
      .update(updates)
      .eq("id", row.id);
    if (updErr) {
      console.warn("[lockstepMirror] driver_assignments update failed:", { id: row.id, updErr });
    }
  }
}