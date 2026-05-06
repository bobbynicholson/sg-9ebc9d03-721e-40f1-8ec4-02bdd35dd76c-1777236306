import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notificationService";
import { emailService } from "@/services/emailService";
import { whatsappIntegrationService } from "@/services/whatsappIntegrationService";
import { ensureInvoiceForOrder } from "@/services/invoiceGenerationService";
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";

/**
 * Order Workflow Management
 * Handles order status transitions, assignments, and workflow logic
 */

export async function updateOrderStatus(
  orderId: string,
  newStatus: string,
  updatedBy?: string
) {
  try {
    // Stamp confirmed_at the first time an order moves to (or past)
    // 'confirmed'. The dashboard's Booked Revenue gate keys on this
    // column, so it has to be written even when the operator skips
    // straight from pending to preparing/ready/etc.
    const advancedStatuses = new Set([
      "confirmed", "preparing", "ready", "in_transit",
      "out_for_delivery", "delivered", "completed",
    ]);
    const updates: any = {
      status: newStatus as any,
      updated_at: new Date().toISOString(),
    };
    if (advancedStatuses.has(newStatus)) {
      // Only set if NULL -- never clobber an existing stamp.
      const { data: prior } = await supabase
        .from("orders")
        .select("confirmed_at")
        .eq("id", orderId)
        .maybeSingle();
      if (!prior?.confirmed_at) {
        updates.confirmed_at = new Date().toISOString();
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

    // Send notifications based on status
    await sendStatusNotifications(order);

    // Auto-invoice on the confirmed transition. Idempotent -- if
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
    // "no automated pre-event reminders" -- the templates existed
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

    // Queue the 24h post-delivery review prompt. Replaces the old
    // setTimeout(callback, 24h) in notificationService -- serverless
    // functions don't survive that long so the timer never fired.
    // We write a pending_reviews row here and a Vercel cron worker
    // (process-pending-reviews) drains it once due_at has passed.
    // Idempotent on order_id via the unique index, so a retry on the
    // delivered transition just no-ops. Wrapped so a failure here
    // never blocks the order delivery.
    if (newStatus === "delivered" && order.company_id) {
      try {
        const deliveredAt = new Date();
        const dueAt = new Date(deliveredAt.getTime() + 24 * 60 * 60 * 1000);

        // Resolve the auth uid for the in-app notification target. Null
        // is fine -- the cron handler will skip the in-app push and
        // still send the email if we have an address.
        let clientUserId: string | null = null;
        try {
          clientUserId = await resolveClientUserId(supabase, order.client_id || null);
        } catch (e) {
          console.warn("[orderWorkflow] resolveClientUserId failed (non-blocking):", e);
        }

        await (supabase as any)
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
      } catch (e) {
        console.warn("[orderWorkflow] pending_reviews insert crashed (non-blocking):", e);
      }
    }

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

    // In-app notification (existing behaviour).
    await notificationService.createNotification({
      user_id: driverId,
      recipient_id: driverId,
      title: "New Delivery Assignment",
      message: `You have been assigned to order ${data.order_number}`,
      type: "order",
      priority: "high",
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

    // Notify chef
    await notificationService.createNotification({
      user_id: chefId,
      recipient_id: chefId,
      title: "New Order Assignment",
      message: `You have been assigned to prepare order ${data.order_number}`,
      type: "order",
      priority: "high",
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
  // never blocks the confirm -- the kitchen page will surface "no plan yet"
  // and an admin can regenerate if needed.
  try {
    const { data } = await supabase
      .from("orders").select("company_id").eq("id", orderId).maybeSingle();
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
  return updateOrderStatus(orderId, "out_for_delivery");
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
     * Supabase client here -- the imported browser client has no
     * cookie/session in that context and RLS will reject the UPDATE
     * with "permission denied for table orders". Browser callers
     * can omit this and the default browser client picks up the
     * user's session automatically.
     */
    client?: any;
  } = {},
) {
  try {
    const nowIso = new Date().toISOString();
    const sb = opts.client || supabase;

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

    // Resource cascades. Fire-and-forget so a bad row doesn't undo the
    // cancel itself.
    void (async () => {
      try {
        await sb
          .from("equipment_bookings")
          .update({ status: "cancelled" } as any)
          .eq("order_id", orderId);
      } catch (e) {
        console.warn("[cancelOrder] equipment_bookings release failed:", e);
      }
    })();

    void (async () => {
      try {
        await sb
          .from("kitchen_prep_tasks")
          .update({ status: "cancelled" } as any)
          .eq("order_id", orderId);
      } catch (e) {
        console.warn("[cancelOrder] kitchen_prep_tasks release failed:", e);
      }
    })();

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
          ? `Cancelled: ${opts.reason_category || "other"} -- ${opts.reason}`
          : `Cancelled: ${opts.reason_category || "other"}`,
      } as any);
    } catch (e) {
      console.warn("[cancelOrder] status history insert failed:", e);
    }

    // Run the existing notification fan-out for the cancelled status.
    try {
      await sendStatusNotifications(data);
    } catch (e) {
      console.warn("[cancelOrder] notifications failed:", e);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error("Error cancelling order:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Pause an active order. Triggered when the client phones to say
 * "we might still go ahead, hold tight" -- distinct from cancel
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
 * preserve it. Pause is reversible -- voiding eagerly would be
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

    // Pause the email queue. Cron filters on status='pending' so a
    // 'paused' row is inert until we flip it back. paused_at lets
    // us audit how long sends sat on hold.
    void (async () => {
      try {
        await sb
          .from("outgoing_email_queue")
          .update({ status: "paused", paused_at: nowIso } as any)
          .eq("trigger_ref_id", orderId)
          .eq("status", "pending")
          .in("trigger_event", ["aftersales", "pre_event"]);
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

    // Inline audit log -- mirrors cancelOrder's pattern.
    try {
      await sb.from("order_status_history").insert({
        order_id: orderId,
        status: "paused",
        changed_by: opts.paused_by_user_id || null,
        notes: opts.reason
          ? `Paused from ${fromStatus}: ${opts.reason_category || "other"} -- ${opts.reason}`
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
    if ((existing as any).status !== "paused") {
      return { success: false, error: "Order is not paused." };
    }
    // Default back to 'confirmed' if paused_from_status is somehow
    // missing (legacy paused orders pre-this-migration).
    const restoreTo = (existing as any).paused_from_status || "confirmed";

    const { data, error } = await sb
      .from("orders")
      .update({
        status: restoreTo,
        paused_at: null,
        paused_by_user_id: null,
        paused_reason: null,
        paused_reason_category: null,
        paused_from_status: null,
        paused_expected_resume_date: null,
      } as any)
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;

    // Un-pause the email queue. Anything still scheduled for the
    // future fires when its scheduled_for time arrives.
    void (async () => {
      try {
        await sb
          .from("outgoing_email_queue")
          .update({ status: "pending", paused_at: null } as any)
          .eq("trigger_ref_id", orderId)
          .eq("status", "paused");
      } catch (e) {
        console.warn("[resumeOrder] email queue resume failed:", e);
      }
    })();

    // Restore prep tasks. Only un-soft-deletes tasks that were
    // pending/in_progress -- completed and cancelled stay where
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
        notes: `Resumed from paused -- back to ${restoreTo}`,
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

  // Quarantine: an imported order with paused comms gets in-app
  // visibility but no customer-facing email/WhatsApp until the owner
  // green-lights the batch.
  const isCommsPaused = !!order.comms_paused_until && new Date(order.comms_paused_until) > new Date();

  // Resolve the client's auth uid ONCE up front. orders.client_id is a FK
  // to clients.id, NOT auth.users.id -- pushing it as recipient_id silently
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

  // 1. In-app notifications -- always fire (admin + driver + client).
  const inApp: Array<{ userId: string; title: string; message: string; type: string; priority?: string }> = [];

  switch (status) {
    case "confirmed":
      if (clientAuthUid) {
        inApp.push({
          userId: clientAuthUid,
          title: "Order confirmed",
          message: `Your order ${orderNumber} is locked in${eventDateLabel ? ` for ${eventDateLabel}` : ""}.`,
          type: "order",
        });
      }
      break;
    case "preparing":
      if (order.user_id) {
        inApp.push({
          userId: order.user_id,
          title: "Kitchen prep started",
          message: `Order ${orderNumber} is now in prep.`,
          type: "order",
        });
      }
      break;
    case "ready":
      if (order.assigned_driver_id) {
        inApp.push({
          userId: order.assigned_driver_id,
          title: "Pickup ready",
          message: `Order ${orderNumber} is ready for collection from the kitchen.`,
          type: "order",
          priority: "high",
        });
      }
      if (order.user_id) {
        inApp.push({
          userId: order.user_id,
          title: "Order ready -- driver alerted",
          message: `Order ${orderNumber} ready, driver has been pinged.`,
          type: "order",
        });
      }
      // Multi-ready cluster alert. When 2+ orders hit ready inside
      // a 30-minute window, dispatch needs to coordinate -- without
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
              userId: order.user_id,
              title: `🔥 ${readyCount} orders ready -- coordinate dispatch`,
              message: `Multiple orders are sitting ready in the last 30 min. Open the dispatch queue to assign drivers before food cools.`,
              type: "dispatch_cluster",
              priority: "urgent",
            } as any);
          }
        } catch (e) {
          console.warn("[sendStatusNotifications] cluster check failed:", e);
        }
      }
      break;
    case "in_transit":
      if (clientAuthUid) {
        inApp.push({
          userId: clientAuthUid,
          title: "Driver on the way",
          message: `Your order ${orderNumber} is on its way${venueShort ? ` to ${venueShort}` : ""}.`,
          type: "order",
          priority: "high",
        });
      }
      break;
    case "delivered":
      if (clientAuthUid) {
        inApp.push({
          userId: clientAuthUid,
          title: "Order delivered",
          message: `Your order ${orderNumber} has been delivered. Enjoy!`,
          type: "order",
        });
      }
      if (order.user_id) {
        inApp.push({
          userId: order.user_id,
          title: "Delivered",
          message: `Order ${orderNumber} delivered.`,
          type: "order",
        });
      }
      break;
    case "completed":
      if (order.user_id) {
        inApp.push({
          userId: order.user_id,
          title: "Order closed out",
          message: `Order ${orderNumber} is fully paid and complete.`,
          type: "order",
        });
      }
      break;
    case "cancelled":
      if (clientAuthUid) {
        inApp.push({
          userId: clientAuthUid,
          title: "Order cancelled",
          message: `Your order ${orderNumber} has been cancelled. Please get in touch with us if this is unexpected.`,
          type: "order",
          priority: "high",
        });
      }
      if (order.user_id) {
        inApp.push({
          userId: order.user_id,
          title: "Order cancelled",
          message: `Order ${orderNumber} cancelled.`,
          type: "order",
        });
      }
      break;
  }
  for (const n of inApp) {
    try {
      await notificationService.createNotification(n as any);
    } catch (e) {
      console.warn("[sendStatusNotifications] in-app push failed:", e);
    }
  }

  // 2. Customer-facing email. Skip if quarantined or no email on file.
  if (!isCommsPaused && order.client_email && order.user_id) {
    const customerEmailFor: Record<string, { subject: string; body: string } | null> = {
      confirmed: {
        subject: `Order confirmed -- ${orderNumber}`,
        body:
          `Hi ${clientFirstName},\n\n` +
          `Your order ${orderNumber}${eventDateLabel ? ` for ${eventDateLabel}` : ""} is confirmed. ` +
          `We'll be in touch closer to the day with the final headcount and any last tweaks.\n\n` +
          `Thanks for booking with us.`,
      },
      preparing: null,
      ready: null,
      in_transit: {
        subject: `On the way -- ${orderNumber}`,
        body:
          `Hi ${clientFirstName},\n\n` +
          `Good news -- your order ${orderNumber} has just left the kitchen and is on its way` +
          `${venueShort ? ` to ${venueShort}` : ""}. ` +
          buildEtaSentence(order) +
          `\n\nReply to this email if anything changes on your side.`,
      },
      delivered: {
        subject: `Delivered -- ${orderNumber}`,
        body:
          `Hi ${clientFirstName},\n\n` +
          `Your order ${orderNumber} has been delivered. We hope it lands the way you hoped!\n\n` +
          `If anything wasn't quite right, please reply -- we read every email and we'd rather hear it.`,
      },
      completed: null,
      // The cancellation email is sent by sendCancellationEmail() from
      // the cancel API endpoint with the actual refund amount included.
      // Skipping here so the client doesn't get two emails.
      cancelled: null,
    };
    const tpl = customerEmailFor[status];
    if (tpl) {
      try {
        await emailService.sendEmail({
          companyId: order.user_id,
          to: order.client_email,
          subject: tpl.subject,
          body: tpl.body,
        });
      } catch (e) {
        console.warn("[sendStatusNotifications] customer email failed:", e);
      }
    }
  }

  // 3. Customer-facing WhatsApp -- only on the high-touch transitions
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
 * scheduling time and snapshot the body into the queue row -- if
 * the template changes later, scheduled rows still send the wording
 * the operator approved when they ran.
 */
async function ensureScheduledAfterSales(order: any): Promise<void> {
  if (!order?.id || !order?.company_id || !order?.client_email) return;

  // Quarantine guard.
  if (order.imported_at || (order.comms_paused_until && new Date(order.comms_paused_until) > new Date())) {
    console.log(`[orderWorkflow] order ${order.id} is quarantined -- skipping after-sales scheduling`);
    return;
  }

  // Idempotency: don't double-schedule.
  const { data: existing } = await (supabase as any)
    .from("outgoing_email_queue")
    .select("id")
    .eq("trigger_event", "aftersales")
    .eq("trigger_ref_id", order.id)
    .limit(1);
  if (existing && existing.length > 0) return;

  try {
    const { defaultAfterSalesTemplates, interpolateEmailTemplate, getEmailVariables } =
      await import("@/lib/afterSalesTemplates");
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
      const sendAt = new Date(eventDate);
      sendAt.setMonth(sendAt.getMonth() + (template.monthsAfterEvent || 0));
      // Don't schedule rows whose send-time is already in the past
      // (e.g. completing a 6-month-old order) -- they'd fire all at
      // once and look like spam. The dashboard can offer a "resume"
      // path later if the operator wants to back-fill.
      if (sendAt.getTime() < Date.now() - 24 * 3600 * 1000) continue;

      rows.push({
        company_id: order.company_id,
        to_email: order.client_email,
        to_name: order.client_name || "there",
        subject: interpolateEmailTemplate(template.subject, variables),
        body: interpolateEmailTemplate(template.body, variables),
        trigger_event: "aftersales",
        trigger_ref_id: order.id,
        status: "pending",
        scheduled_for: sendAt.toISOString(),
        template_type: `aftersales_${template.id}`,
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
 * remember to send these manually and forget half the time -- two
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
  const { data: existing } = await (supabase as any)
    .from("outgoing_email_queue")
    .select("id")
    .eq("trigger_event", "pre_event")
    .eq("trigger_ref_id", order.id)
    .limit(1);
  if (existing && existing.length > 0) return;

  const eventDate = new Date(order.event_date);
  const eventLabel = eventDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  const firstName = String(order.client_name || "there").trim().split(" ")[0] || "there";

  const reminders = [
    {
      offsetMs: -7 * 24 * 3600 * 1000,
      key: "week_before",
      subject: `One week to go -- your event on ${eventLabel}`,
      body:
        `Hi ${firstName},\n\n` +
        `Just a friendly reminder that your event is one week away (${eventLabel}). ` +
        `If anything has changed -- final headcount, menu tweaks, drop-off time -- now is the perfect time to let us know.\n\n` +
        `Reply to this email or open your client portal to request a change.\n\n` +
        `Looking forward to it.`,
    },
    {
      offsetMs: -1 * 24 * 3600 * 1000,
      key: "day_before",
      subject: `Tomorrow's the day -- ${eventLabel}`,
      body:
        `Hi ${firstName},\n\n` +
        `Quick check-in -- everything is locked in for tomorrow. ` +
        `Final guest count + venue address are confirmed on our side. ` +
        `If anything urgent comes up between now and then, give us a ring.\n\n` +
        `See you tomorrow!`,
    },
  ];

  const rows: any[] = [];
  for (const r of reminders) {
    const sendAt = new Date(eventDate.getTime() + r.offsetMs);
    // Skip if the reminder time is already in the past (e.g. event
    // is 3 days away when the order gets confirmed).
    if (sendAt.getTime() < Date.now()) continue;
    rows.push({
      company_id: order.company_id,
      to_email: order.client_email,
      to_name: order.client_name || "there",
      subject: r.subject,
      body: r.body,
      trigger_event: "pre_event",
      trigger_ref_id: order.id,
      status: "pending",
      scheduled_for: sendAt.toISOString(),
      template_type: `pre_event_${r.key}`,
      variables: { clientName: firstName, eventDate: eventLabel },
    });
  }

  if (rows.length > 0) {
    await (supabase as any).from("outgoing_email_queue").insert(rows);
  }
}