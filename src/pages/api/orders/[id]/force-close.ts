/**
 * POST /api/orders/[id]/force-close -- Wave 70.21
 *
 * Admin / owner one-click "this is done" override for orders
 * the team didn't tick through in real time. Common scenarios:
 *   - Late paperwork: event happened, nobody marked prep or ready
 *   - Seed data / imported historicals that need closing out
 *   - Recovery from a workflow snag (chef forgot to tap ready,
 *     driver delivered without confirming)
 *
 * One call cascades through every dependent step so the order
 * lands cleanly in a terminal state:
 *
 *   1. Mark every kitchen_prep_task that's still pending / in
 *      progress as 'done'. Preserves rows (no soft-delete) so
 *      the timeline + reporting keep the audit trail.
 *   2. Stamp orders.ready_at + picked_up_at + actual_delivery_time
 *      if they weren't set (uses event_time on event_date as the
 *      best-guess clock for historical orders, else now).
 *   3. Flip order status straight to 'delivered' via the canonical
 *      updateOrderStatus path -- that fires the order_status_history
 *      row + status-change notifications + any post-completion
 *      cascades the workflow service handles centrally.
 *   4. Audit-log a force_close action so the trail records WHO
 *      forced + WHEN + WHY.
 *
 * Body:
 *   {
 *     reason?: string,   // free-text "why we're force-closing"
 *     target_status?: "delivered" | "completed"  // default 'delivered'
 *                       // (the codebase's terminal closed state)
 *   }
 *
 * Auth: owner / company_admin / admin / super_admin in the same
 * company as the order. Refuses on already-terminal orders (no-op).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { updateOrderStatus } from "@/services/order/orderWorkflow";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const TERMINAL_STATUSES = new Set(["delivered", "completed", "cancelled", "refunded"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
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
    const role = ((profile as any)?.active_role || (profile as any)?.role || "").toString().toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }
    const callerCompanyId = (profile as any)?.company_id as string | undefined;

    const body = (req.body || {}) as { reason?: string; target_status?: string };
    const reason = (body.reason || "").trim().slice(0, 500) || null;
    const targetStatus = body.target_status === "completed" ? "completed" : "delivered";

    const admin: any = getServiceSupabase();

    // Wave 70.33 -- accept either a UUID `id` or an order_number like
    // "ORD-003829". The OrderReadinessChip passes `id` (UUID), but the
    // endpoint used to 404 with "Order not found" if a UUID lookup
    // came back empty, which masked the actual cause (caller passing
    // the wrong identifier, stale page state, etc). Try id first;
    // if nothing matches and the value looks like an order_number,
    // fall back to that lookup -- scoped to the caller's company so
    // we never accidentally cross tenants.
    const lookupSelect = "id, order_number, company_id, status, event_date, event_time, ready_at, picked_up_at, actual_delivery_time";
    const { data: byId, error: byIdErr } = await admin
      .from("orders")
      .select(lookupSelect)
      .eq("id", orderId)
      .maybeSingle();
    if (byIdErr) {
      console.warn("[orders/force-close] id lookup error:", byIdErr, "orderId=", orderId);
    }
    let order = byId;
    if (!order && callerCompanyId) {
      // Defensive fallback: maybe the chip / page is passing a string
      // that isn't a UUID. Try order_number scoped to the caller's
      // company (RLS bypass means service role sees all -- the
      // company scope is the safety net against cross-tenant leaks).
      const { data: byNumber, error: byNumberErr } = await admin
        .from("orders")
        .select(lookupSelect)
        .eq("order_number", orderId)
        .eq("company_id", callerCompanyId)
        .maybeSingle();
      if (byNumberErr) {
        console.warn("[orders/force-close] order_number fallback error:", byNumberErr, "orderId=", orderId);
      }
      if (byNumber) {
        console.warn(`[orders/force-close] resolved orderId='${orderId}' via order_number fallback -> ${byNumber.id}. Caller passed the wrong field.`);
        order = byNumber;
      }
    }
    if (!order) {
      // Surface the orderId in the error so the operator + console
      // both see what was attempted. Previously the bare "Order not
      // found" gave the operator nothing to act on.
      console.warn(`[orders/force-close] no order matched orderId='${orderId}' for company='${callerCompanyId}'`);
      return res.status(404).json({
        error: `Order not found: '${orderId}'. Try refreshing the page -- if it persists, the order may have been deleted.`,
        orderId,
      });
    }
    // From this point on, prefer the resolved row's real UUID so
    // every downstream write (prep tasks, stamps, status flip, audit
    // log) is keyed by the canonical id even if the caller passed
    // an order_number.
    const resolvedOrderId = (order as any).id as string;
    if (role !== "super_admin" && callerCompanyId && callerCompanyId !== (order as any).company_id) {
      return res.status(403).json({ error: "Wrong company" });
    }
    const currentStatus = ((order as any).status || "").toLowerCase();
    if (TERMINAL_STATUSES.has(currentStatus)) {
      return res.status(409).json({
        error: `Order is already in terminal state '${currentStatus}'. Nothing to force-close.`,
        currentStatus,
      });
    }

    // 1. Mark any pending / in-progress prep tasks as done. Preserves
    //    rows for the audit trail; the chef sees them flip on the
    //    production page.
    const { count: tasksFlipped } = await admin
      .from("kitchen_prep_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() }, { count: "exact" })
      .eq("order_id", resolvedOrderId)
      .in("status", ["pending", "in_progress"]);

    // 2. Best-guess clock for historical orders: event_time on
    //    event_date if both set, else now. Stamp only the columns
    //    that aren't already populated so we don't overwrite real
    //    chef-captured times.
    const bestGuessMs = (() => {
      const ed = (order as any).event_date as string | null;
      const et = (order as any).event_time as string | null;
      if (ed && et) {
        const dt = new Date(`${ed}T${et.slice(0, 8)}`);
        if (!isNaN(dt.getTime())) return dt.getTime();
      }
      return Date.now();
    })();
    const bestGuessIso = new Date(bestGuessMs).toISOString();
    const stamps: Record<string, string> = {};
    if (!(order as any).ready_at) stamps.ready_at = bestGuessIso;
    if (!(order as any).picked_up_at) stamps.picked_up_at = bestGuessIso;
    if (!(order as any).actual_delivery_time) stamps.actual_delivery_time = bestGuessIso;
    if (Object.keys(stamps).length > 0) {
      await admin.from("orders").update(stamps).eq("id", resolvedOrderId);
    }

    // 3. Run the canonical status transition so order_status_history
    //    + notifications + downstream cascades fire normally. We use
    //    the workflow helper rather than a bare update so behaviour
    //    matches a "real" delivery being recorded.
    const statusResult = await updateOrderStatus(resolvedOrderId, targetStatus as any, {
      actorUserId: user.id,
      // Pass a marker so the history row records this was forced.
      note: reason
        ? `Force-closed by admin: ${reason}`
        : "Force-closed by admin override",
    } as any);
    if (!(statusResult as any)?.success && !(statusResult as any)?.ok) {
      // updateOrderStatus returns various shapes across the codebase;
      // we don't bail on shape mismatch, just log.
      console.warn("[orders/force-close] updateOrderStatus returned unexpected shape:", statusResult);
    }

    // 4. Standalone audit log entry so a SAR / compliance review can
    //    grep for force_close events specifically.
    try {
      await admin.from("audit_logs").insert({
        company_id: (order as any).company_id,
        user_id: user.id,
        action: "order_force_closed",
        entity_type: "order",
        entity_id: resolvedOrderId,
        details: {
          from_status: currentStatus,
          to_status: targetStatus,
          tasks_flipped: tasksFlipped || 0,
          stamps_added: stamps,
          reason,
        },
      });
    } catch (auditErr) {
      console.warn("[orders/force-close] audit insert failed:", auditErr);
    }

    return res.status(200).json({
      ok: true,
      from: currentStatus,
      to: targetStatus,
      tasks_flipped: tasksFlipped || 0,
      stamps_added: Object.keys(stamps),
      message: `Order closed. Status flipped ${currentStatus} -> ${targetStatus}. ${tasksFlipped || 0} prep task${(tasksFlipped || 0) === 1 ? "" : "s"} marked done.`,
    });
  } catch (err: any) {
    console.error("[orders/force-close] crashed:", err);
    return res.status(500).json({ error: err?.message || "Force close crashed" });
  }
}
