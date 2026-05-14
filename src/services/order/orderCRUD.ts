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

/**
 * Phase 8 #9: clone an existing order. Used by the "Duplicate"
 * quick action on /admin/orders for repeat clients (corporate
 * weekly drops, recurring weddings on the same package). Copies
 * the order row + its menu_items / equipment_items snapshots,
 * mints a new order_number, resets all lifecycle stamps so the
 * clone starts at status='pending' with no payments / no driver
 * / no POD. Returns the new order id.
 *
 * Caller passes the new event_date (string YYYY-MM-DD) -- a
 * duplicate without a forward date would silently land on the
 * source order's date and confuse dispatch.
 */
export async function duplicateOrder(
  sourceOrderId: string,
  newEventDate: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const { data: src, error: readErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", sourceOrderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!src) return { success: false, error: "Source order not found" };
    const s: any = src;

    // Strip fields that should NOT carry over to the clone:
    // ids, lifecycle stamps, payment state, public token, driver
    // assignment, POD artefacts, audit timestamps.
    const STRIP = new Set([
      "id", "order_number", "created_at", "updated_at", "deleted_at",
      "confirmed_at", "completed_at", "delivered_at", "cancelled_at",
      "deposit_paid_at", "balance_paid_at", "amount_paid", "balance_due",
      "payment_status", "deposit_payment_id", "balance_payment_id",
      "public_token", "public_token_issued_at",
      "assigned_driver_id", "assigned_chef_id", "assigned_vehicle_id",
      "pod_photo_url", "pod_signature_url", "pod_recipient_name", "pod_captured_at",
      "quote_id", "converted_from_quote_id",
    ]);
    const clone: any = {};
    for (const [k, v] of Object.entries(s)) {
      if (!STRIP.has(k)) clone[k] = v;
    }
    clone.event_date = newEventDate;
    clone.status = "pending";
    // Mint a fresh order_number with a -COPY suffix on the source
    // so it's obvious in the list this is a clone, not a re-issue.
    clone.order_number = `${(s.order_number || "ORD")}-COPY-${Date.now().toString(36).slice(-4).toUpperCase()}`;

    const { data: inserted, error: insertErr } = await supabase
      .from("orders")
      .insert(clone)
      .select()
      .single();
    if (insertErr) throw insertErr;
    const newId = (inserted as any).id;

    // Clone order_items if any. Equipment bookings are deliberately
    // NOT cloned because they're tied to a specific booked window
    // and would create immediate phantom reservations on the new date.
    try {
      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", sourceOrderId);
      if (Array.isArray(items) && items.length > 0) {
        const cloned = items.map((it: any) => {
          const { id, created_at, updated_at, ...rest } = it;
          return { ...rest, order_id: newId };
        });
        await supabase.from("order_items").insert(cloned);
      }
    } catch (itemsErr) {
      console.warn("[duplicateOrder] order_items clone failed (non-blocking):", itemsErr);
    }

    // Lifecycle backfill so the new order shows up correctly in
    // contacts / leads / quote / invoice scaffolding. Same path
    // createOrder uses.
    void (async () => {
      try {
        const { lifecycleService } = await import("@/services/lifecycleService");
        await lifecycleService.ensureLifecycleArtifactsForOrder(newId);
      } catch (e) {
        console.warn("[duplicateOrder] lifecycle backfill failed:", e);
      }
    })();

    return { success: true, data: inserted };
  } catch (error: any) {
    console.error("[duplicateOrder] failed:", error);
    return { success: false, error: error?.message || "Duplicate failed" };
  }
}

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

/**
 * Audit (May 2026, Wave 5): companyId is now required. The previous
 * version hydrated an order by id alone, trusting RLS as the only
 * tenant boundary -- meaning webhook callers (payment-confirmation,
 * stripe-confirmation, yoco-confirmation) that use the service role
 * could load any tenant's order with one untrusted id. companyId
 * verification here makes the contract explicit at the call site.
 *
 * For migration: the parameter is still optional but logs a warning
 * when omitted so legacy callers surface in console. Strict mode
 * coming in a follow-up.
 */
export async function getOrderById(orderId: string, companyId?: string) {
  try {
    let query = supabase
      .from("orders")
      .select(`
        *,
        client:clients(*),
        order_items(*),
        assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, email, phone),
        assigned_chef:profiles!orders_assigned_chef_id_fkey(id, full_name, email)
      `)
      .eq("id", orderId)
      .is("deleted_at", null);
    if (companyId) {
      query = query.eq("company_id", companyId);
    } else {
      console.warn("[getOrderById] called without companyId -- relying on RLS only. Pass companyId from a verified context.");
    }
    const { data, error } = await query.single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Error fetching order:", error);
    return { success: false, error: error.message };
  }
}

export async function getAllOrders(companyId: string) {
  try {
    // Wave 27.1: pulled the linked quote's public_token + quote_number
    // so the /admin/orders "from quote" badge can deep-link to the
    // polished branded /q/{public_token} client view, not the bare
    // /admin/quotes/{id} editor screen. Operator gets a one-click
    // window into "what does the client actually see for this order".
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(*),
        order_items(*),
        quote:quotes!orders_quote_id_fkey(public_token, quote_number),
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
    // Detect a guest_count change BEFORE we write. If the count moves
    // we re-plan kitchen prep tasks after the update lands so the
    // cook duration honours the new count (Phase 1 #10 scaled the
    // duration but only for new tasks; existing tasks created at the
    // old count would otherwise stay stale). Audit Kitchen G3.
    let priorGuestCount: number | null = null;
    let priorCompanyId: string | null = null;
    if (updates && updates.guest_count !== undefined) {
      const { data: prior } = await supabase
        .from("orders")
        .select("guest_count, company_id")
        .eq("id", orderId)
        .maybeSingle();
      priorGuestCount = Number((prior as any)?.guest_count ?? 0);
      priorCompanyId = (prior as any)?.company_id ?? null;
    }

    // Defensive confirmed_at stamp. The admin orders page calls this
    // function with arbitrary updates including status changes, which
    // bypasses orderWorkflow.updateOrderStatus's confirmed_at logic.
    // Result: an admin moving a pending order to confirmed via the
    // edit modal saved status='confirmed' but left confirmed_at null
    // -- silently breaking the Booked Revenue tile and every other
    // gate keyed on this column. Only set when not already in the
    // updates payload and the row's existing value is null.
    if (updates && typeof updates.status === "string" && updates.confirmed_at === undefined) {
      const advancedStatuses = new Set([
        "confirmed", "preparing", "ready", "in_transit",
        "delivered", "completed",
      ]);
      if (advancedStatuses.has(String(updates.status).toLowerCase())) {
        const { data: existing } = await supabase
          .from("orders")
          .select("confirmed_at")
          .eq("id", orderId)
          .maybeSingle();
        if (!(existing as any)?.confirmed_at) {
          updates = { ...updates, confirmed_at: new Date().toISOString() };
        }
      }
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    // Guest count moved -- re-plan kitchen prep tasks so the cook
    // duration scales to the new count. Phase 1 #10 made the cook
    // duration scale with guest_count / base_servings, but only at
    // plan-time; an existing order whose count changed kept its
    // original (now-stale) durations. force:true soft-deletes any
    // pending tasks and re-plans from scratch. Non-blocking so an
    // edit still saves even if the kitchen service is unhappy.
    if (
      priorGuestCount !== null &&
      priorCompanyId &&
      Number(updates.guest_count) !== priorGuestCount
    ) {
      try {
        const { kitchenPrepService } = await import("@/services/kitchenPrepService");
        await kitchenPrepService.ensurePrepTasksForOrder(
          priorCompanyId,
          orderId,
          undefined,
          undefined,
          { force: true },
        );
      } catch (rescaleErr) {
        console.warn("[updateOrder] prep task rescale failed (non-blocking):", rescaleErr);
      }
    }

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