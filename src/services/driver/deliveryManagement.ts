import { supabase } from "@/integrations/supabase/client";
import { driverPayService } from "@/services/driverPayService";

/**
 * Driver Delivery Management Module
 * Handles delivery status updates, confirmations, and tracking.
 *
 * Stage 4 of the driver hourly-rate build wires auto clock-in /
 * clock-out into this file - markOrderPickedUp opens a driver shift,
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
  const { data, error } = await supabase
    .from("orders")
    .select("company_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) console.error("[driver/deliveryManagement/companyIdForOrder] orders lookup failed:", error);
  return (data as any)?.company_id ?? null;
}

export interface DeliveryUpdate {
  orderId: string;
  status: "pending" | "confirmed" | "preparing" | "ready" | "in_transit" | "delivered" | "completed";
  notes?: string;
  proofOfDelivery?: string;
  clientSignature?: string;
}

/**
 * Update delivery status.
 *
 * Audit (May 2026, Wave 5): the old path wrote `status` directly to
 * orders with no transition validation, no per-status _at stamps,
 * no order_status_history parity with orderWorkflow, and no
 * customer notification fan-out. A driver tapping "delivered"
 * never triggered the client delivered email/WhatsApp, the
 * POD-missing admin alert, the pending_reviews queue, equipment
 * cleaning rows, or the collection-trip cascade - all of which
 * fire only from orderWorkflow.updateOrderStatus.
 *
 * Now: verify the driver owns this order (assigned_driver_id OR
 * driver_id legacy), then delegate to updateOrderStatus which runs
 * the full state machine + side-effect fan-out.
 */
export async function updateDeliveryStatus(
  orderId: string,
  status: "pending" | "confirmed" | "preparing" | "ready" | "in_transit" | "delivered" | "completed",
  driverId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Ownership guard: refuse the update if this driver isn't on
    // the order via either column (assigned_driver_id or legacy
    // driver_id).
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, assigned_driver_id, driver_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) console.error("[driver/deliveryManagement/updateDeliveryStatus] orders ownership lookup failed:", orderErr);
    if (!order) return { success: false, error: "Order not found." };
    const isAssigned =
      (order as any).assigned_driver_id === driverId ||
      (order as any).driver_id === driverId;
    if (!isAssigned) {
      return { success: false, error: "You are not assigned to this order." };
    }

    // Delegate to the canonical state machine. updateOrderStatus
    // handles transition validation, _at stamping, status history,
    // and the full side-effect cascade (email, WhatsApp, equipment
    // cleaning, collection trip, etc).
    const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
    const result = await updateOrderStatus(orderId, status, driverId);
    if (!result.success) return { success: false, error: (result as any).error };
    // notes left for caller to stamp via order_status_history if
    // needed; updateOrderStatus inserts the canonical row itself.

    // Auto shift bookkeeping (Stage 4 of driver hourly-rate build).
    // in_transit -> open shift. delivered/completed -> close it.
    if (status === "in_transit") {
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
 * Confirm delivery with proof.
 *
 * Audit (May 2026, Wave 5): the previous version accepted POD photo,
 * signature and notes arguments but threw them all on the floor --
 * only `status: "delivered"` reached the database. Every order
 * confirmed via this path ended up with NULL pod_photo_url /
 * pod_signature_url / pod_captured_at, which then triggered the
 * "POD missing" admin alert and meant we had no proof when a client
 * disputed the drop. Now writes the artefacts and delegates the
 * status flip to updateOrderStatus so all the downstream fan-out
 * (client email, equipment cleaning, collection trip) fires.
 */
export async function confirmDelivery(
  orderId: string,
  driverId: string,
  proofOfDelivery?: string,
  clientSignature?: string,
  notes?: string,
  recipientName?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Ownership guard
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, assigned_driver_id, driver_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) console.error("[driver/deliveryManagement/confirmDelivery] orders ownership lookup failed:", orderErr);
    if (!order) return { success: false, error: "Order not found." };
    const isAssigned =
      (order as any).assigned_driver_id === driverId ||
      (order as any).driver_id === driverId;
    if (!isAssigned) {
      return { success: false, error: "You are not assigned to this order." };
    }

    // Persist POD artefacts up front so the columns are populated
    // before updateOrderStatus reads them for its downstream alerts.
    const podUpdate: any = {};
    if (proofOfDelivery) podUpdate.pod_photo_url = proofOfDelivery;
    if (clientSignature) podUpdate.pod_signature_url = clientSignature;
    if (recipientName) podUpdate.pod_recipient_name = recipientName;
    if (proofOfDelivery || clientSignature || recipientName) {
      podUpdate.pod_captured_at = new Date().toISOString();
    }
    if (Object.keys(podUpdate).length > 0) {
      const { error: podErr } = await supabase
        .from("orders")
        .update(podUpdate)
        .eq("id", orderId);
      if (podErr) {
        console.warn("[confirmDelivery] POD stamp failed (non-blocking):", podErr);
      }
    }

    // Delegate the status flip + side-effect cascade.
    const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
    const result = await updateOrderStatus(orderId, "delivered", driverId);
    if (!result.success) return { success: false, error: (result as any).error };
    if (notes) {
      // Persist driver-provided notes to the history row.
      try {
        await supabase.from("order_status_history").insert({
          order_id: orderId,
          status: "delivered",
          changed_by: driverId,
          notes,
        });
      } catch {
        // Non-blocking
      }
    }

    // Close the auto-shift opened on pickup.
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
        client:clients(client_name, email, phone, address:billing_address_line1),
        items:order_items(
          quantity,
          item_name,
          unit_price
        )
      `)
      .eq("assigned_driver_id", driverId)
      // Canonical "active" status set. The DB enum only contains
      // in_transit; readers referencing out_for_delivery elsewhere
      // are dead code (the column rejects that value).
      .in("status", ["confirmed", "preparing", "ready", "in_transit"])
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
 * Mark order as picked up from kitchen.
 *
 * Flow audit Leg E P0-3: the previous version wrote `status='in_transit'`
 * directly to orders, bypassing updateOrderStatus - no transition
 * validation (a driver could pick up a cancelled order), no
 * order_status_history row, no sendStatusNotifications fan-out (client
 * "your order is on its way" email never fired from this path).
 * Now delegates to the state machine + keeps the autoClockIn hook.
 */
export async function markOrderPickedUp(
  orderId: string,
  driverId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Ownership guard
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, assigned_driver_id, driver_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) console.error("[driver/deliveryManagement/markOrderPickedUp] orders ownership lookup failed:", orderErr);
    if (!order) return { success: false, error: "Order not found." };
    const isAssigned =
      (order as any).assigned_driver_id === driverId ||
      (order as any).driver_id === driverId;
    if (!isAssigned) {
      return { success: false, error: "You are not assigned to this order." };
    }

    const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
    const result = await updateOrderStatus(orderId, "in_transit", driverId);
    if (!result.success) return { success: false, error: (result as any).error };

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