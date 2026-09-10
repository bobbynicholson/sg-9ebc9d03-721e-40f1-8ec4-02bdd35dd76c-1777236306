/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/orders/[id]/purge
 *
 * TIGHTEN I.121 (2026-06-02): permanent test-data / mistake removal.
 *
 * The normal cancel flow (/api/orders/[id]/cancel) preserves the order
 * row at status='cancelled' so the financial trail, refund record,
 * Xero credit-note and reporting all stay intact - the right answer
 * for any real cancellation. But it leaves a graveyard of "we were
 * just testing" or "I picked the wrong client" orders in the index.
 *
 * Purge wipes the order and every per-order child row. Owner / company
 * admin only, requires the operator to type the order number, never
 * sends a client email, and stamps a single audit_logs row before
 * deletion so the action is recoverable in forensics even though the
 * record is gone.
 *
 * Cascade plan (read from information_schema 2026-06-02):
 *
 *   AUTO via ON DELETE CASCADE on the orders FK:
 *     cancellation_requests, cleaning_event_checklists,
 *     cleaning_event_handovers, client_access_log,
 *     client_access_tokens, delivery_feedback, dispatch_messages,
 *     driver_assignments, driver_confirmations, email_automation_log,
 *     equipment_handovers, equipment_hire_orders, event_attendance,
 *     kitchen_prep_tasks, kitchen_task_completions,
 *     order_amendment_requests, order_assignment_audit,
 *     order_attachments, order_chat_messages, order_items,
 *     order_status_history, outsource_assignments, pending_reviews,
 *     recipe_scaling_history, vehicle_bookings
 *
 *   MUST DELETE FIRST (NO ACTION blocks the order delete):
 *     deliveries, gps_tracking
 *
 *   SHOULD DELETE FIRST (SET NULL would orphan a money / quote row):
 *     payments, invoices, inventory_transactions, shopping_list_items,
 *     equipment_bookings, equipment_shortage_flags, leads.source_order_id
 *
 *   QUOTES.converted_to_order_id is SET NULL on delete. The linked
 *     quote is preserved by default. Operator can opt in to deleting
 *     the quote too via also_delete_quote=true (only allowed when the
 *     quote is the source of THIS order and has no other orders).
 *
 * Body:
 *   {
 *     confirm_order_number: string,   // must match exactly
 *     also_delete_quote?: boolean,    // wipe the originating quote too
 *     notes?: string                  // free text captured in audit
 *   }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { releaseOrderResources } from "@/services/order/releaseResources";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const orderId = String(req.query.id || "");
  if (!orderId) return res.status(400).json({ error: "Order id is required" });

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });

  const { data: profile } = await ssr
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", user.id)
    .maybeSingle();
  const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
  if (!ALLOWED_ROLES.has(role)) {
    return res.status(403).json({
      error: "Purge is owner / company admin only - other roles see the regular cancel flow.",
    });
  }

  const body = (req.body || {}) as any;
  const confirmOrderNumber = String(body.confirm_order_number || "").trim();
  const alsoDeleteQuote = !!body.also_delete_quote;
  const notes = body.notes ? String(body.notes).slice(0, 1000) : null;

  // Read the order BEFORE we touch anything so we can verify the
  // confirmation, scope to tenant, and capture the snapshot.
  const { data: order } = await ssr
    .from("orders")
    .select("id, company_id, order_number, status, client_name, client_email, event_date, total_amount, quote_id, deleted_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (
    role !== "super_admin" &&
    (profile as any)?.company_id !== (order as any).company_id
  ) {
    return res.status(403).json({ error: "Wrong company" });
  }
  if (!confirmOrderNumber || confirmOrderNumber !== (order as any).order_number) {
    return res.status(400).json({
      error: `Type the order number "${(order as any).order_number}" exactly to confirm purge.`,
    });
  }

  const svc = getServiceSupabase() as any;
  const companyId = (order as any).company_id;
  const quoteId = (order as any).quote_id || null;
  const counts: Record<string, number> = {};

  const tryDelete = async (label: string, table: string, column: string) => {
    try {
      const { data, error } = await svc
        .from(table)
        .delete()
        .eq(column, orderId)
        .select("id");
      if (error) {
        console.warn(`[orders/purge] ${label} delete failed:`, error);
        counts[label] = -1;
        return;
      }
      counts[label] = Array.isArray(data) ? data.length : 0;
    } catch (e) {
      console.warn(`[orders/purge] ${label} delete crashed:`, e);
      counts[label] = -1;
    }
  };

  // 1. Stamp the audit row FIRST so the action survives the delete.
  try {
    // audit_logs columns: entity_type/entity_id identify the row; the payload
    // goes in `details` (there is no order_id or metadata column).
    await svc.from("audit_logs").insert({
      company_id: companyId,
      user_id: user.id,
      action: "order_purged",
      entity_type: "orders",
      entity_id: orderId,
      details: {
        order_number: (order as any).order_number,
        client_name: (order as any).client_name,
        client_email: (order as any).client_email,
        event_date: (order as any).event_date,
        total_amount: (order as any).total_amount,
        prior_status: (order as any).status,
        quote_id: quoteId,
        also_delete_quote: alsoDeleteQuote,
        operator_notes: notes,
        notify_client: false,
      },
    });
  } catch (e) {
    console.warn("[orders/purge] audit row failed (continuing):", e);
  }

  // 2. Release resources silently (mark supplier follow-ups as done,
  //    void invoices) before the hard delete. We don't email anyone
  //    here - this is a quiet wipe.
  try {
    await releaseOrderResources({
      orderId,
      sb: svc,
      companyId,
      actorUserId: user.id,
      mode: "cancel",
      silent: true,
    });
  } catch (e) {
    console.warn("[orders/purge] releaseOrderResources crashed (continuing):", e);
  }

  // 3. Hard delete the rows that would otherwise block or orphan.
  //    Order matters where one row references another (payments may
  //    reference invoices, etc.) - safest order is leaves first.
  await tryDelete("gps_tracking",            "gps_tracking",            "order_id");
  await tryDelete("deliveries",              "deliveries",              "order_id");
  await tryDelete("inventory_transactions",  "inventory_transactions",  "order_id");
  await tryDelete("payments",                "payments",                "order_id");
  await tryDelete("invoices",                "invoices",                "order_id");
  await tryDelete("equipment_bookings",      "equipment_bookings",      "order_id");
  await tryDelete("equipment_shortage_flags","equipment_shortage_flags","order_id");
  await tryDelete("shopping_list_items",     "shopping_list_items",     "source_order_id");

  // 4. Detach the lead source so the lead survives (it pre-existed
  //    the order and may have other linkage we don't want to nuke).
  try {
    await svc.from("leads").update({ source_order_id: null }).eq("source_order_id", orderId);
  } catch (e) {
    console.warn("[orders/purge] leads detach failed:", e);
  }

  // 5. Quote handling. By default detach + leave the quote alive
  //    (status='accepted', converted_to_order_id NULL after the
  //    cascade). When the operator opts in AND the quote was the
  //    source of this order, also delete it - but only if no OTHER
  //    orders reference it.
  let purgedQuote: { id: string; quote_number: string | null } | null = null;
  if (alsoDeleteQuote && quoteId) {
    const { data: otherOrders } = await svc
      .from("orders")
      .select("id")
      .eq("quote_id", quoteId)
      .neq("id", orderId);
    if (!otherOrders || otherOrders.length === 0) {
      const { data: q } = await svc
        .from("quotes")
        .select("id, quote_number")
        .eq("id", quoteId)
        .maybeSingle();
      if (q) {
        const { error: qDelErr } = await svc.from("quotes").delete().eq("id", quoteId);
        if (!qDelErr) purgedQuote = q as any;
        else console.warn("[orders/purge] quote delete failed:", qDelErr);
      }
    }
  }

  // 6. Finally, the order itself. CASCADE handles the long list of
  //    child tables we left alone above.
  const { error: orderDelErr } = await svc.from("orders").delete().eq("id", orderId);
  if (orderDelErr) {
    console.error("[orders/purge] orders delete failed:", orderDelErr);
    return res.status(500).json({
      error: "Could not delete the order row. Linked records may need manual cleanup.",
      partial_counts: counts,
    });
  }
  counts["order"] = 1;

  return res.status(200).json({
    ok: true,
    deleted_counts: counts,
    purged_quote: purgedQuote,
    audit: { action: "order_purged", order_number: (order as any).order_number },
  });
}

export default withApiLogging(handler);
