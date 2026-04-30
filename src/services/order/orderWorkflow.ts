import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notificationService";

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

async function sendStatusNotifications(order: any) {
  // Send notifications to relevant parties based on status
  const notifications = [];

  switch (order.status) {
    case "confirmed":
      if (order.client_id) {
        notifications.push({
          userId: order.client_id,
          title: "Order Confirmed",
          message: `Your order ${order.order_number} has been confirmed`,
          type: "order",
        });
      }
      break;
    case "ready":
      if (order.assigned_driver_id) {
        notifications.push({
          userId: order.assigned_driver_id,
          title: "Order Ready for Pickup",
          message: `Order ${order.order_number} is ready for delivery`,
          type: "order",
          priority: "high",
        });
      }
      break;
    case "delivered":
      if (order.client_id) {
        notifications.push({
          userId: order.client_id,
          title: "Order Delivered",
          message: `Your order ${order.order_number} has been delivered`,
          type: "order",
        });
      }
      break;
  }

  for (const notification of notifications) {
    await notificationService.createNotification(notification);
  }
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