import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notificationService";
import { emailService } from "@/services/emailService";
import { whatsappIntegrationService } from "@/services/whatsappIntegrationService";
import { ensureInvoiceForOrder } from "@/services/invoiceGenerationService";

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
    // Update order status
    const { data: order, error } = await supabase
      .from("orders")
      .update({ 
        status: newStatus as any,
        updated_at: new Date().toISOString()
      })
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

    // Notify driver
    await notificationService.createNotification({
      user_id: driverId,
      recipient_id: driverId,
      title: "New Delivery Assignment",
      message: `You have been assigned to order ${data.order_number}`,
      type: "order",
      priority: "high",
    });

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

export async function cancelOrder(orderId: string, reason?: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .update({ 
        status: "cancelled",
        cancellation_reason: reason 
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error("Error cancelling order:", error);
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

  // 1. In-app notifications -- always fire (admin + driver + client).
  const inApp: Array<{ userId: string; title: string; message: string; type: string; priority?: string }> = [];

  switch (status) {
    case "confirmed":
      if (order.client_id) {
        inApp.push({
          userId: order.client_id,
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
      break;
    case "in_transit":
      if (order.client_id) {
        inApp.push({
          userId: order.client_id,
          title: "Driver on the way",
          message: `Your order ${orderNumber} is on its way${venueShort ? ` to ${venueShort}` : ""}.`,
          type: "order",
          priority: "high",
        });
      }
      break;
    case "delivered":
      if (order.client_id) {
        inApp.push({
          userId: order.client_id,
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
      if (order.client_id) {
        inApp.push({
          userId: order.client_id,
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
      cancelled: {
        subject: `Order cancelled -- ${orderNumber}`,
        body:
          `Hi ${clientFirstName},\n\n` +
          `This is a confirmation that order ${orderNumber} has been cancelled. ` +
          `If this wasn't expected, please get in touch with us straight away.`,
      },
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
      await whatsappIntegrationService.sendWhatsAppMessage({
        to: order.client_phone,
        type: "text",
        text: { body: wa },
      } as any);
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