// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { notificationService } from "./notificationService";

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
    return data as (Delivery & {
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
      .update({ ...updates, updated_at: new Date().toISOString() })
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

    // Send real-time notification on status change
    await this.notifyStatusChange(deliveryId, status, driverNotes);

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
      const { data: order } = await supabase
        .from("orders")
        .select("user_id, client_name, client_email")
        .eq("id", orderId)
        .single();

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

      // Send notification to order owner
      await notificationService.createNotification({
        recipient_id: order.user_id,
        type: notificationType,
        title: "Delivery Status Update",
        message,
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

      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: order.client_email,
          subject: status === "delivered" 
            ? `Delivery Completed - ${order.client_name}`
            : `Delivery Status Update - ${order.client_name}`,
          text: status === "delivered"
            ? `Your delivery has been completed successfully!\n\nClient: ${order.client_name}\nTime: ${new Date().toLocaleString()}`
            : `Delivery Status Update\n\nClient: ${order.client_name}\nStatus: ${status}\n${notes ? `Notes: ${notes}` : ""}`,
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

    return {
      completed,
      failed,
      pending: total - completed - failed,
      total,
      success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      earnings: completed * 250, // R250 per delivery
    };
  },

  async addDeliveryPhoto(deliveryId: string, photoUrl: string) {
    return this.updateDelivery(deliveryId, { delivery_photo_url: photoUrl });
  },

  async addClientSignature(deliveryId: string, signature: string) {
    return this.updateDelivery(deliveryId, { client_signature: signature });
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
};
