import { supabase } from "@/integrations/supabase/client";

/**
 * Driver Delivery Management Module
 * Handles delivery status updates, confirmations, and tracking
 */

export interface DeliveryUpdate {
  orderId: string;
  status: "pending" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "completed";
  notes?: string;
  proofOfDelivery?: string;
  clientSignature?: string;
}

/**
 * Update delivery status
 */
export async function updateDeliveryStatus(
  orderId: string,
  status: "pending" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "completed",
  driverId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("orders")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("assigned_driver_id", driverId);

    if (error) throw error;

    // Log the status change
    await supabase.from("order_status_history").insert({
      order_id: orderId,
      status,
      changed_by: driverId,
      notes,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error updating delivery status:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Confirm delivery with proof
 */
export async function confirmDelivery(
  orderId: string,
  driverId: string,
  proofOfDelivery?: string,
  clientSignature?: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("orders")
      .update({
        status: "delivered",
      } as any) // Cast to any to bypass strict type checking for custom delivery fields
      .eq("id", orderId)
      .eq("assigned_driver_id", driverId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error confirming delivery:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get driver's assigned deliveries
 */
export async function getDriverDeliveries(
  driverId: string,
  date?: string
): Promise<{ success: boolean; deliveries?: any[]; error?: string }> {
  try {
    let query = supabase
      .from("orders")
      .select(`
        *,
        client:clients(client_name, email, phone, address),
        items:order_items(
          quantity,
          item_name,
          unit_price
        )
      `)
      .eq("assigned_driver_id", driverId)
      .in("status", ["confirmed", "preparing", "ready", "out_for_delivery"])
      .order("event_date");

    if (date) {
      query = query.eq("event_date", date);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, deliveries: data };
  } catch (error: any) {
    console.error("Error fetching driver deliveries:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark order as picked up from kitchen
 */
export async function markOrderPickedUp(
  orderId: string,
  driverId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("orders")
      .update({
        status: "out_for_delivery",
        picked_up_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("assigned_driver_id", driverId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error marking order as picked up:", error);
    return { success: false, error: error.message };
  }
}