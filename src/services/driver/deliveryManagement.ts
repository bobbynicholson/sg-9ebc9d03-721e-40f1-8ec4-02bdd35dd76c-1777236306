import { supabase } from "@/integrations/supabase/client";
import { driverPayService } from "@/services/driverPayService";

/**
 * Driver Delivery Management Module
 * Handles delivery status updates, confirmations, and tracking.
 *
 * Stage 4 of the driver hourly-rate build wires auto clock-in /
 * clock-out into this file -- markOrderPickedUp opens a driver shift,
 * confirmDelivery / updateDeliveryStatus(delivered) closes it. BCEA
 * Sunday / public-holiday detection happens server-side in
 * driverPayService.autoClockOut, so no caller logic needed here.
 */

/**
 * Look up the company_id for an order. Auto clock-in / clock-out need
 * it to scope the driver_shifts insert correctly. We don't expose
 * company_id to the driver UI flow, so a quick read here keeps the
 * dispatch surface clean.
 */
async function companyIdForOrder(orderId: string): Promise<string | null> {
  const { data } = await supabase
    .from("orders")
    .select("company_id")
    .eq("id", orderId)
    .maybeSingle();
  return (data as any)?.company_id ?? null;
}

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

    // Auto shift bookkeeping (Stage 4 of driver hourly-rate build).
    // out_for_delivery -> open shift. delivered/completed -> close it.
    // Failures here don't block the status change -- the shift is
    // bookkeeping, not the truth of the delivery.
    if (status === "out_for_delivery") {
      const companyId = await companyIdForOrder(orderId);
      if (companyId) {
        await driverPayService.autoClockIn({ companyId, driverId, orderId });
      }
    } else if (status === "delivered" || status === "completed") {
      const companyId = await companyIdForOrder(orderId);
      if (companyId) {
        await driverPayService.autoClockOut({ companyId, driverId, orderId });
      }
    }

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

    // Close the auto-shift opened on pickup (Stage 4). Soft-fails so a
    // missing shift doesn't roll back the delivery confirmation.
    const companyId = await companyIdForOrder(orderId);
    if (companyId) {
      await driverPayService.autoClockOut({ companyId, driverId, orderId });
    }

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

    // Open the auto-shift for hourly-pay tracking (Stage 4). Idempotent
    // -- service skips if a shift already exists for this driver+order.
    const companyId = await companyIdForOrder(orderId);
    if (companyId) {
      await driverPayService.autoClockIn({ companyId, driverId, orderId });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error marking order as picked up:", error);
    return { success: false, error: error.message };
  }
}