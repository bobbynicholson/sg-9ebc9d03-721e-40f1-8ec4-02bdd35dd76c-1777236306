import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Order = Tables<"orders">;

export const orderService = {
  async getOrders(userId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("event_date", { ascending: false });

    if (error) {
      console.error("Error fetching orders:", error);
      return [];
    }

    return data || [];
  },

  async getOrder(orderId: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) {
      console.error("Error fetching order:", error);
      return null;
    }

    return data;
  },

  async createOrder(order: Omit<Order, "id" | "created_at" | "updated_at">): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .insert([order])
      .select()
      .single();

    if (error) {
      console.error("Error creating order:", error);
      throw error;
    }

    return data;
  },

  async updateOrder(orderId: string, updates: Partial<Order>): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error updating order:", error);
      throw error;
    }

    return data;
  },

  async deleteOrder(orderId: string): Promise<boolean> {
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (error) {
      console.error("Error deleting order:", error);
      throw error;
    }

    return true;
  },

  async getOrdersByDateRange(userId: string, startDate: string, endDate: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .gte("event_date", startDate)
      .lte("event_date", endDate)
      .order("event_date");

    if (error) {
      console.error("Error fetching orders by date range:", error);
      return [];
    }

    return data || [];
  },

  async getDriverOrders(driverId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("assigned_driver_id", driverId)
      .order("event_date", { ascending: false });

    if (error) {
      console.error("Error fetching driver orders:", error);
      return [];
    }

    return data || [];
  },

  async addWaiterService(
    orderId: string,
    waiterDurationHours: 1 | 2 | 3,
    waiterHourlyRate: number
  ): Promise<Order | null> {
    const waiterTotalFee = waiterDurationHours * waiterHourlyRate;

    const { data, error } = await supabase
      .from("orders")
      .update({
        requires_waiter: true,
        waiter_duration_hours: waiterDurationHours,
        waiter_hourly_rate: waiterHourlyRate,
        waiter_total_fee: waiterTotalFee,
        equipment_return_method: "waiter_return"
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error adding waiter service:", error);
      throw error;
    }

    return data;
  },

  async removeWaiterService(orderId: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        requires_waiter: false,
        waiter_duration_hours: null,
        waiter_hourly_rate: null,
        waiter_total_fee: null,
        equipment_return_method: "later_collection"
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error removing waiter service:", error);
      throw error;
    }

    return data;
  },

  async getOrdersRequiringWaiter(userId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("requires_waiter", true)
      .order("event_date");

    if (error) {
      console.error("Error fetching waiter orders:", error);
      return [];
    }

    return data || [];
  }
};
