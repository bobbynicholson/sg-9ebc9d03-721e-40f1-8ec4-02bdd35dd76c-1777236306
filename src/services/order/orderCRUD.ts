import { supabase } from "@/integrations/supabase/client";

/**
 * Order CRUD Operations
 * Basic create, read, update, delete operations for orders
 */

export async function createOrder(orderData: any) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Error creating order:", error);
    return { success: false, error: error.message };
  }
}

export async function getOrderById(orderId: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(*),
        order_items(*),
        assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, email, phone),
        assigned_chef:profiles!orders_assigned_chef_id_fkey(id, full_name, email)
      `)
      .eq("id", orderId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Error fetching order:", error);
    return { success: false, error: error.message };
  }
}

export async function getAllOrders(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(*),
        order_items(*),
        assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, email, phone),
        assigned_chef:profiles!orders_assigned_chef_id_fkey(id, full_name, email)
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    return [];
  }
}

export async function updateOrder(orderId: string, updates: any) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Error updating order:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteOrder(orderId: string) {
  try {
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting order:", error);
    return { success: false, error: error.message };
  }
}

export async function getOrdersByStatus(companyId: string, status: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(*),
        order_items(*),
        assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, email, phone),
        assigned_chef:profiles!orders_assigned_chef_id_fkey(id, full_name, email)
      `)
      .eq("company_id", companyId)
      .eq("status", status as any)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error("Error fetching orders by status:", error);
    return [];
  }
}

export async function getOrdersByDateRange(companyId: string, startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(*),
        order_items(*),
        assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, email, phone),
        assigned_chef:profiles!orders_assigned_chef_id_fkey(id, full_name, email)
      `)
      .eq("company_id", companyId)
      .gte("event_date", startDate)
      .lte("event_date", endDate)
      .order("event_date", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error("Error fetching orders by date range:", error);
    return [];
  }
}