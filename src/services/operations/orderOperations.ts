import { supabase } from "@/integrations/supabase/client";

/**
 * Order Operations Module
 * Handles order creation, updates, and status management
 */

export interface CreateOrderData {
  companyId: string;
  clientId: string;
  clientName: string;
  eventDate: string;
  eventTime: string;
  venueAddress: string;
  guestCount: number;
  menuItems: Array<{
    menuItemId: string;
    quantity: number;
    price: number;
  }>;
  specialRequirements?: string;
  totalAmount: number;
  depositAmount?: number;
  currency: string;
}

export async function createOrder(data: CreateOrderData) {
  try {
    // Generate order number
    const orderNumber = `ORD-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        company_id: data.companyId,
        client_id: data.clientId,
        order_number: orderNumber,
        client_name: data.clientName,
        event_date: data.eventDate,
        event_time: data.eventTime,
        venue_address: data.venueAddress,
        guest_count: data.guestCount,
        special_requirements: data.specialRequirements,
        total_amount: data.totalAmount,
        deposit_amount: data.depositAmount || data.totalAmount * 0.3,
        status: "pending",
        currency: data.currency,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Create order items
    if (data.menuItems && data.menuItems.length > 0) {
      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(
          data.menuItems.map((item) => ({
            order_id: order.id,
            menu_item_id: item.menuItemId,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.price * item.quantity,
          }))
        );

      if (itemsError) throw itemsError;
    }

    return { success: true, order };
  } catch (error: any) {
    console.error("Error creating order:", error);
    return { success: false, error: error.message };
  }
}

export async function updateOrderStatus(orderId: string, status: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, order: data };
  } catch (error: any) {
    console.error("Error updating order status:", error);
    return { success: false, error: error.message };
  }
}

export async function assignStaffToOrder(
  orderId: string,
  driverId?: string,
  chefId?: string
) {
  try {
    const updates: any = { updated_at: new Date().toISOString() };
    if (driverId) updates.assigned_driver_id = driverId;
    if (chefId) updates.assigned_chef_id = chefId;

    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, order: data };
  } catch (error: any) {
    console.error("Error assigning staff to order:", error);
    return { success: false, error: error.message };
  }
}

export async function getOrdersByCompany(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(client_name, email, phone),
        driver:profiles!orders_assigned_driver_id_fkey(full_name, email),
        chef:profiles!orders_assigned_chef_id_fkey(full_name, email)
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { success: true, orders: data || [] };
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    return { success: false, error: error.message, orders: [] };
  }
}

export async function getOrderById(orderId: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(client_name, email, phone, address),
        driver:profiles!orders_assigned_driver_id_fkey(full_name, email, phone),
        chef:profiles!orders_assigned_chef_id_fkey(full_name, email, phone),
        order_items(
          id,
          quantity,
          unit_price,
          total_price,
          menu_item:menu_items(item_name, description, category)
        )
      `)
      .eq("id", orderId)
      .single();

    if (error) throw error;

    return { success: true, order: data };
  } catch (error: any) {
    console.error("Error fetching order:", error);
    return { success: false, error: error.message };
  }
}