import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Order = Tables<"orders">;
export type Quote = Tables<"quotes">;

interface ConvertQuoteToOrderParams {
  quoteId: string;
  depositPercentage: number;
  balanceDueDaysBeforeEvent: number;
  lastChangeDaysBeforeEvent: number;
}

interface OrderStatusUpdate {
  orderId: string;
  newStatus: Order["status"];
  notes?: string;
}

export const orderService = {
  /**
   * Convert a quote to an order after payment confirmation
   */
  async convertQuoteToOrder(params: ConvertQuoteToOrderParams): Promise<Order | null> {
    const { quoteId, depositPercentage, balanceDueDaysBeforeEvent, lastChangeDaysBeforeEvent } = params;

    // Get the quote
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      console.error("Error fetching quote:", quoteError);
      throw new Error("Quote not found");
    }

    // Calculate deposit and balance
    const depositAmount = (quote.total * depositPercentage) / 100;
    const balanceAmount = quote.total - depositAmount;

    // Calculate important dates
    const eventDate = new Date(quote.event_date);
    const balanceDueDate = new Date(eventDate);
    balanceDueDate.setDate(balanceDueDate.getDate() - balanceDueDaysBeforeEvent);

    const lastChangeDate = new Date(eventDate);
    lastChangeDate.setDate(lastChangeDate.getDate() - lastChangeDaysBeforeEvent);

    // Generate order number
    const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

    // Create order
    const orderData = {
      user_id: quote.user_id,
      region_id: quote.region_id,
      quote_id: quote.id,
      order_number: orderNumber,
      client_name: quote.client_name,
      client_email: quote.client_email,
      client_phone: quote.client_phone,
      event_date: quote.event_date,
      event_time: quote.event_time,
      venue_address: quote.venue_address,
      guest_count: quote.guest_count,
      menu_items: quote.menu_items,
      equipment_items: quote.equipment_items,
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      currency: quote.currency,
      deposit_amount: depositAmount,
      balance_amount: balanceAmount,
      balance_due_date: balanceDueDate.toISOString(),
      last_change_allowed_date: lastChangeDate.toISOString(),
      status: "pending_deposit",
      payment_status: "pending",
      delivery_status: "pending",
    };

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([orderData])
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      throw orderError;
    }

    // Update quote status
    await supabase
      .from("quotes")
      .update({ status: "converted" })
      .eq("id", quoteId);

    // Create equipment bookings if equipment items exist
    if (quote.equipment_items && Array.isArray(quote.equipment_items)) {
      await this.createEquipmentBookings(order.id, quote.equipment_items as any[], eventDate);
    }

    return order;
  },

  /**
   * Create equipment bookings for an order
   */
  async createEquipmentBookings(
    orderId: string,
    equipmentItems: any[],
    eventDate: Date
  ): Promise<void> {
    const { data: order } = await supabase
      .from("orders")
      .select("user_id, venue_address")
      .eq("id", orderId)
      .single();

    if (!order) return;

    // Get equipment details and create bookings
    for (const item of equipmentItems) {
      const { data: equipment } = await supabase
        .from("equipment")
        .select("*")
        .eq("user_id", order.user_id)
        .eq("name", item.name)
        .single();

      if (!equipment) continue;

      // Calculate booking times (event day + cleaning time)
      const bookedFrom = new Date(eventDate);
      bookedFrom.setHours(0, 0, 0, 0);

      const bookedUntil = new Date(eventDate);
      bookedUntil.setDate(bookedUntil.getDate() + 1);

      const availableFrom = new Date(bookedUntil);
      availableFrom.setHours(availableFrom.getHours() + (equipment.cleaning_time_hours || 2));

      await supabase.from("equipment_bookings").insert([{
        user_id: order.user_id,
        order_id: orderId,
        equipment_id: equipment.id,
        quantity: item.quantity,
        booked_from: bookedFrom.toISOString(),
        booked_until: bookedUntil.toISOString(),
        available_from: availableFrom.toISOString(),
        status: "booked",
      }]);
    }
  },

  /**
   * Record deposit payment
   */
  async recordDepositPayment(
    orderId: string,
    paymentReference: string,
    gateway: string
  ): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        deposit_paid: true,
        deposit_paid_at: new Date().toISOString(),
        payment_reference: paymentReference,
        payment_gateway: gateway,
        status: "deposit_paid",
        payment_status: "partial",
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error recording deposit:", error);
      throw error;
    }

    return data;
  },

  /**
   * Record balance payment
   */
  async recordBalancePayment(
    orderId: string,
    paymentReference: string
  ): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        balance_paid: true,
        balance_paid_at: new Date().toISOString(),
        payment_reference: paymentReference,
        status: "confirmed",
        payment_status: "paid",
        amount_paid: supabase.rpc("get_order_total", { order_id: orderId }),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error recording balance:", error);
      throw error;
    }

    return data;
  },

  /**
   * Update order status with validation
   */
  async updateOrderStatus({ orderId, newStatus, notes }: OrderStatusUpdate): Promise<Order | null> {
    const updates: Partial<Order> = {
      status: newStatus,
    };

    if (notes) {
      updates.internal_notes = notes;
    }

    // Set delivery status based on order status
    if (newStatus === "in_transit") {
      updates.delivery_status = "in_transit";
    } else if (newStatus === "delivered") {
      updates.delivery_status = "delivered";
      updates.delivery_time = new Date().toISOString();
    } else if (newStatus === "completed") {
      updates.delivery_status = "completed";
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error updating order status:", error);
      throw error;
    }

    return data;
  },

  /**
   * Allow client to modify order details (guest count, address) before deadline
   */
  async updateOrderDetails(
    orderId: string,
    updates: {
      guest_count?: number;
      venue_address?: string;
      venue_lat?: number;
      venue_lng?: number;
      special_instructions?: string;
    }
  ): Promise<Order | null> {
    // Check if modifications are still allowed
    const { data: order } = await supabase
      .from("orders")
      .select("last_change_allowed_date")
      .eq("id", orderId)
      .single();

    if (!order) {
      throw new Error("Order not found");
    }

    const now = new Date();
    const deadline = new Date(order.last_change_allowed_date!);

    if (now > deadline) {
      throw new Error("Order modification deadline has passed");
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        final_guest_count: updates.guest_count,
        venue_address: updates.venue_address,
        venue_lat: updates.venue_lat,
        venue_lng: updates.venue_lng,
        special_instructions: updates.special_instructions,
        final_order_confirmed_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error updating order details:", error);
      throw error;
    }

    return data;
  },

  /**
   * Assign order to region and make available to drivers
   */
  async assignOrderToRegion(
    orderId: string,
    regionId: string
  ): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        region_id: regionId,
        status: "assigned",
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error assigning order to region:", error);
      throw error;
    }

    return data;
  },

  /**
   * Get all orders for a specific user
   */
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

  /**
   * Get single order
   */
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

  /**
   * Get orders by date range
   */
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

  /**
   * Get available orders for drivers in a region (not yet assigned)
   */
  async getAvailableOrdersForDrivers(regionId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("region_id", regionId)
      .eq("status", "assigned")
      .is("assigned_driver_id", null)
      .order("event_date");

    if (error) {
      console.error("Error fetching available orders:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Get orders assigned to a specific driver
   */
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

  /**
   * Get orders requiring balance payment soon
   */
  async getOrdersNeedingBalancePayment(userId: string): Promise<Order[]> {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("balance_paid", false)
      .lte("balance_due_date", threeDaysFromNow.toISOString())
      .order("balance_due_date");

    if (error) {
      console.error("Error fetching orders needing balance:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Add waiter service to order
   */
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
        equipment_return_method: "waiter_return",
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

  /**
   * Remove waiter service from order
   */
  async removeWaiterService(orderId: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        requires_waiter: false,
        waiter_duration_hours: null,
        waiter_hourly_rate: null,
        waiter_total_fee: null,
        equipment_return_method: "later_collection",
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

  /**
   * Get all orders requiring waiter service
   */
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
  },

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, reason: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        internal_notes: reason,
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error cancelling order:", error);
      throw error;
    }

    // Free up equipment bookings
    await supabase
      .from("equipment_bookings")
      .update({ status: "cancelled" })
      .eq("order_id", orderId);

    return data;
  },
};
