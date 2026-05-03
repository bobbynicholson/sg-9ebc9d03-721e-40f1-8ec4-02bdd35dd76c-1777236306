import { supabase } from "@/integrations/supabase/client";

/**
 * Order CRUD Operations
 * Basic create, read, update, delete operations for orders.
 *
 * Read paths filter `deleted_at IS NULL` so soft-deleted orders never
 * leak into the kanban / dashboards / lists. The hard-delete path is
 * gone -- deleteOrder now soft-deletes, and refuses entirely on orders
 * that have been confirmed (deposit_paid OR confirmed_at). The only
 * way to remove a confirmed order is to cancel it through the
 * cancelOrder workflow, which preserves payment + audit history.
 */

export async function createOrder(orderData: any) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (error) throw error;

    // Every order must have its lifecycle artifacts (contact, lead,
    // quote, invoice) so /admin/contacts, /admin/leads etc. don't
    // show ghost rows. Fire-and-forget so a backfill failure doesn't
    // unwind the order create itself.
    void (async () => {
      try {
        const { lifecycleService } = await import("@/services/lifecycleService");
        await lifecycleService.ensureLifecycleArtifactsForOrder((data as any).id);
      } catch (e) {
        console.warn("[createOrder] lifecycle backfill failed:", e);
      }
    })();

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
      .is("deleted_at", null)
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
        assigned_chef:profiles!orders_assigned_chef_id_fkey(id, full_name, email),
        assigned_vehicle:vehicles!orders_assigned_vehicle_id_fkey(id, plate, nickname, refrigerated, has_warmer, max_pax_served, capacity_kg, owner_kind, requires_two_people)
      `)
      .eq("company_id", companyId)
      .is("deleted_at", null)
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

/**
 * deleteOrder -- soft-delete only. Hard-delete is gone.
 *
 * Refuses entirely on confirmed orders (deposit_paid OR confirmed_at).
 * The only path to remove a confirmed order is through cancelOrder,
 * which preserves payment + audit history and triggers the policy
 * refund flow.
 *
 * Returns { success, error?, requiresCancel? } so the UI can surface
 * the right message + redirect to the cancel modal.
 */
export async function deleteOrder(orderId: string) {
  try {
    const { data: order, error: readErr } = await supabase
      .from("orders")
      .select("id, deposit_paid, confirmed_at, deleted_at, status")
      .eq("id", orderId)
      .maybeSingle();

    if (readErr) throw readErr;
    if (!order) return { success: false, error: "Order not found" };
    if ((order as any).deleted_at) {
      return { success: true }; // already soft-deleted, treat as no-op
    }

    const isConfirmed =
      (order as any).deposit_paid === true || !!(order as any).confirmed_at;
    if (isConfirmed) {
      return {
        success: false,
        error:
          "This order has been confirmed (deposit paid or admin-confirmed). Use Cancel instead so the policy refund and audit trail are preserved.",
        requiresCancel: true,
      };
    }

    const { error } = await supabase
      .from("orders")
      .update({ deleted_at: new Date().toISOString() } as any)
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
      .is("deleted_at", null)
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
      .is("deleted_at", null)
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