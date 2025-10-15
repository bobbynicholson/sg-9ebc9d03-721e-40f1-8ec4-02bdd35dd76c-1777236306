import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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

    return this.updateDelivery(deliveryId, updates);
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
