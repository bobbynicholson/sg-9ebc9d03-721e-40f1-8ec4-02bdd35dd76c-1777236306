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
  return updateOrderStatus(orderId, "confirmed");
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