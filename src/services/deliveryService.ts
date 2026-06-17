/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { notificationService } from "./notificationService";
import { deductInventoryForOrder } from "./inventoryDeductionService";

type Delivery = Database["public"]["Tables"]["deliveries"]["Row"];
type DeliveryInsert = Database["public"]["Tables"]["deliveries"]["Insert"];
type DeliveryUpdate = Database["public"]["Tables"]["deliveries"]["Update"];

export const deliveryService = {
  async getDeliveries(userId: string) {
    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        *,
        orders!inner (
          id,
          client_name,
          event_date,
          user_id
        ),
        profiles!deliveries_driver_id_fkey (
          id,
          full_name,
          email,
          phone_number
        )
      `)
      .eq("orders.user_id", userId)
      .order("delivery_time", { ascending: true });

    if (error) throw error;
    return data as unknown as (Delivery & {
      orders: { id: string; client_name: string; event_date: string; user_id: string };
      profiles: { id: string; full_name: string; email: string; phone_number: string } | null;
    })[];
  },

  async getDeliveryById(id: string) {
    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        *,
        orders (
          id,
          client_name,
          event_date,
          venue_address
        ),
        profiles!deliveries_driver_id_fkey (
          id,
          full_name,
          email,
          phone_number
        )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  async getDeliveriesByDriver(driverId: string) {
    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        *,
        orders (
          id,
          client_name,
          event_date,
          venue_address
        )
      `)
      .eq("driver_id", driverId)
      .order("delivery_time", { ascending: true });

    if (error) throw error;
    return data;
  },

  async getDeliveriesByStatus(userId: string, status: string) {
    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        *,
        orders!inner (
          id,
          client_name,
          event_date,
          user_id
        ),
        profiles!deliveries_driver_id_fkey (
          id,
          full_name,
          email,
          phone_number
        )
      `)
      .eq("orders.user_id", userId)
      .eq("status", status)
      .order("delivery_time", { ascending: true });

    if (error) throw error;
    return data;
  },

  async createDelivery(delivery: Omit<DeliveryInsert, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabase
      .from("deliveries")
      .insert([delivery])
      .select()
      .single();

    if (error) throw error;
    return data as Delivery;
  },

  async updateDelivery(id: string, updates: DeliveryUpdate) {
    const { data, error } = await supabase
      .from("deliveries")
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Delivery;
  },

  async assignDriver(deliveryId: string, driverId: string) {
    return this.updateDelivery(deliveryId, { driver_id: driverId });
  },

  async updateDeliveryStatus(deliveryId: string, status: string, driverNotes?: string) {
    const updates: DeliveryUpdate = { status };

    if (status === "delivered") {
      updates.actual_delivery_time = new Date().toISOString();
    }

    if (driverNotes) {
      updates.driver_notes = driverNotes;
    }

    const result = await this.updateDelivery(deliveryId, updates);

    // Wave 49 B7 - mirror the legacy `deliveries` write into the
    // canonical orderWorkflow path. Pre-Wave-49 the legacy
    // DeliveryStatusModal wrote ONLY to deliveries.actual_delivery_time
    // - orders.delivered_at stayed NULL - so admin dashboards,
    // driver pay snapshots, and the after-sales drip all read
    // "never delivered" while the legacy table said otherwise.
    // Now route a matching status flip through the same machine
    // that the new driver UI uses, so both tables advance in
    // lockstep until the deliveries table is fully retired.
    let mirrored = false;
    if (status === "delivered" || status === "in_transit") {
      try {
        const targetStatus = status === "in_transit" ? "in_transit" : "delivered";
        const orderId = (result as any)?.order_id;
        if (orderId) {
          const { updateOrderStatus } = await import("./order/orderWorkflow");
          await updateOrderStatus(orderId, targetStatus as any);
          mirrored = true;
        }
      } catch (e) {
        console.warn("[deliveryService] orderWorkflow lockstep mirror failed (non-blocking):", e);
      }
    }

    // Legacy fan-out, but ONLY for statuses we did NOT route through the
    // canonical machine. updateOrderStatus already runs
    // sendStatusNotifications (owner + client email/WhatsApp), so firing
    // notifyStatusChange here too double-notifies and double-emails the
    // client on delivered/in_transit. Keep it for failed/other statuses
    // (and as a fallback when the mirror couldn't run, e.g. no order_id).
    if (!mirrored) {
      await this.notifyStatusChange(deliveryId, status, driverNotes);
    }

    return result;
  },

  async notifyStatusChange(deliveryId: string, newStatus: string, notes?: string) {
    try {
      // Get delivery details with client info
      const delivery = await this.getDeliveryById(deliveryId);
      if (!delivery) return;

      const orderId = delivery.orders?.id;
      if (!orderId) return;

      // Get order owner (admin/client)
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("user_id, client_name, client_email")
        .eq("id", orderId)
        .single();
      if (orderErr) console.error("[deliveryService] orders lookup failed:", orderErr);

      if (!order) return;

      // Create notification message
      let message = "";
      let notificationType: "info" | "warning" | "success" | "error" = "info";

      if (newStatus === "delivered") {
        message = `Delivery completed for ${order.client_name}`;
        notificationType = "success";
      } else if (newStatus === "failed") {
        message = `Delivery failed for ${order.client_name}${notes ? `: ${notes}` : ""}`;
        notificationType = "error";
      } else if (newStatus === "in_transit") {
        message = `Driver en route to ${order.client_name}`;
        notificationType = "info";
      } else {
        message = `Delivery status updated: ${newStatus} for ${order.client_name}`;
      }

      // Send notification to order owner. Deep-link to the order on
      // the admin dashboard so the operator can see delivery status
      // in context.
      await notificationService.createNotification({
        recipient_id: order.user_id,
        user_id: order.user_id,
        notification_type: `delivery_${newStatus}`,
        title: "Delivery Status Update",
        message,
        priority: notificationType === "error" ? "high" : "normal",
        link: `/order/${orderId}?role=admin`,
        related_entity_type: "order",
        related_entity_id: orderId,
        metadata: {
          related_id: deliveryId,
          related_type: "delivery"
        }
      });

      // Send email notification for important status changes
      if (newStatus === "delivered" || newStatus === "failed") {
        await this.sendStatusEmail(order, newStatus, notes);
      }

    } catch (error) {
      console.error("Error sending status notification:", error);
      // Don't throw - notification failure shouldn't break status update
    }
  },

  async sendStatusEmail(
    order: { client_name: string; client_email?: string },
    status: string,
    notes?: string
  ) {
    try {
      if (!order.client_email) return;

      // Wave 23.5: subject-line tone polish. "Delivery Completed -
      // Bobby Nicholson" reads templated. The recipient is the client
      // - they don't need to see their own name in the subject;
      // they need to know the catering company finished the delivery.
      // Body now also drops the client-name echo for the same reason.
      const firstName = (order.client_name || "").split(" ")[0] || "there";
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: order.client_email,
          subject: status === "delivered"
            ? "Your delivery is done - enjoy the event"
            : `Delivery update - ${status.replace(/_/g, " ")}`,
          text: status === "delivered"
            ? `Hi ${firstName},\n\nYour delivery is on-site as of ${new Date().toLocaleString("en-ZA")}. Enjoy the event!\n\nReply to this email if anything's not as expected.`
            : `Hi ${firstName},\n\nQuick status update on your delivery: ${status.replace(/_/g, " ")}.\n${notes ? `\nNote from the team: ${notes}\n` : ""}`,
        }),
      });
    } catch (error) {
      console.error("Error sending status email:", error);
    }
  },

  async getDeliveryStats(userId: string) {
    const { data: deliveries, error } = await supabase
      .from("deliveries")
      .select(`
        id,
        status,
        orders!inner (user_id)
      `)
      .eq("orders.user_id", userId);

    if (error) throw error;

    const stats = {
      total: deliveries?.length || 0,
      delivered: deliveries?.filter(d => d.status === "delivered").length || 0,
      pending: deliveries?.filter(d => d.status === "pending").length || 0,
      in_transit: deliveries?.filter(d => d.status === "in_transit").length || 0,
      failed: deliveries?.filter(d => d.status === "failed").length || 0,
    };

    return {
      ...stats,
      success_rate: stats.total > 0 
        ? Math.round((stats.delivered / stats.total) * 100) 
        : 0,
    };
  },

  async getDriverDeliveryStats(driverId: string, period: "today" | "week" | "month" = "today") {
    const now = new Date();
    const startDate = new Date();

    if (period === "today") {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setMonth(now.getMonth() - 1);
    }

    const { data: deliveries, error } = await supabase
      .from("deliveries")
      .select("id, status, actual_delivery_time")
      .eq("driver_id", driverId)
      .gte("created_at", startDate.toISOString());

    if (error) throw error;

    const completed = deliveries?.filter(d => d.status === "delivered").length || 0;
    const failed = deliveries?.filter(d => d.status === "failed").length || 0;
    const total = deliveries?.length || 0;

    // Earnings intentionally omitted - driverPayService is the
    // canonical source for what a driver gets paid. A flat R250-per-
    // delivery field here used to be a footgun: any caller that
    // displayed it would lie about real per-driver rates.
    return {
      completed,
      failed,
      pending: total - completed - failed,
      total,
      success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  },

  // The `deliveries` table has no delivery_photo_url / client_signature
  // columns - the canonical proof-of-delivery store is orders.pod_photo_url
  // / pod_signature_url (what driver/deliveryManagement.confirmDelivery
  // uses). Resolve the delivery's order and write there, so POD capture
  // from DeliveryStatusModal stops throwing.
  async addDeliveryPhoto(deliveryId: string, photoUrl: string) {
    const { data: d } = await supabase
      .from("deliveries").select("order_id").eq("id", deliveryId).maybeSingle();
    const orderId = (d as any)?.order_id;
    if (!orderId) return false;
    const { error } = await supabase
      .from("orders").update({ pod_photo_url: photoUrl } as any).eq("id", orderId);
    if (error) throw error;
    return true;
  },

  async addClientSignature(deliveryId: string, signature: string) {
    const { data: d } = await supabase
      .from("deliveries").select("order_id").eq("id", deliveryId).maybeSingle();
    const orderId = (d as any)?.order_id;
    if (!orderId) return false;
    const { error } = await supabase
      .from("orders").update({ pod_signature_url: signature } as any).eq("id", orderId);
    if (error) throw error;
    return true;
  },

  async deleteDelivery(id: string) {
    const { error } = await supabase
      .from("deliveries")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  async getTodaysDeliveries(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        *,
        orders!inner (
          id,
          client_name,
          event_date,
          user_id
        ),
        profiles!deliveries_driver_id_fkey (
          id,
          full_name,
          email,
          phone_number
        )
      `)
      .eq("orders.user_id", userId)
      .gte("delivery_time", today.toISOString())
      .lt("delivery_time", tomorrow.toISOString())
      .order("delivery_time", { ascending: true });

    if (error) throw error;
    return data;
  },

  async getUpcomingDeliveries(userId: string, days: number = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        *,
        orders!inner (
          id,
          client_name,
          event_date,
          user_id
        ),
        profiles!deliveries_driver_id_fkey (
          id,
          full_name,
          email,
          phone_number
        )
      `)
      .eq("orders.user_id", userId)
      .gte("delivery_time", now.toISOString())
      .lte("delivery_time", futureDate.toISOString())
      .order("delivery_time", { ascending: true });

    if (error) throw error;
    return data;
  },

  // markDelivered REMOVED. Flow audit Leg D P0-2: this function
  // wrote `order_status` (wrong column; canonical is `status`) and
  // `completed_at` (wrong stamp; canonical is `delivered_at`), and
  // had zero callers in the repo. The canonical delivery path is
  // orderWorkflow.updateOrderStatus(orderId, "delivered", driverId)
  // which now also fires the inventory deduction we used to call
  // from here.
};
