/**
 * POST /api/orders/[id]/cancel
 *
 * Admin-side order cancellation. Wraps the full flow:
 *
 *   1. Auth: admin/owner of the order's company.
 *   2. Snapshot the refund policy via get_refund_for_order RPC.
 *   3. Owner-override gate: if days-to-event < the policy's late-cancel
 *      threshold, only super_admin / company_admin / owner can complete
 *      the cancel. plain admins get 403.
 *   4. Run cancelOrder() workflow (cascade releases + status flip +
 *      audit + notifications fan-out).
 *   5. Record a cancellation_requests row with the policy snapshot,
 *      calculated refund amount, and refund-approved amount (= calc
 *      unless overridden).
 *   6. If refund > 0, insert a payments row type='refund' status='pending'
 *      so finance can later mark it paid via the refund-paid endpoint.
 *
 * Body:
 *   {
 *     reason_category: 'client_cancelled'|'no_payment'|'kitchen_capacity'|
 *                       'weather'|'force_majeure'|'other',
 *     reason?: string,
 *     refund_override?: number,    // owner can override the calc (uses calc if omitted)
 *     bypass_late_guard?: boolean  // owner-only escape hatch
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { cancelOrder } from "@/services/order/orderWorkflow";
import { sendCancellationEmail } from "@/services/email/cancellationEmails";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const OWNER_ROLES = new Set(["super_admin", "company_admin", "owner"]);
const VALID_CATEGORIES = new Set([
  "client_cancelled",
  "no_payment",
  "kitchen_capacity",
  "weather",
  "force_majeure",
  "other",
]);

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
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    const body = (req.body || {}) as any;
    const reason_category = String(body.reason_category || "other");
    const reason = body.reason ? String(body.reason) : null;
    const refund_override = body.refund_override !== undefined ? Number(body.refund_override) : null;
    const bypass_late_guard = !!body.bypass_late_guard;

    if (!VALID_CATEGORIES.has(reason_category)) {
      return res.status(400).json({ error: "Invalid reason_category" });
    }

    // Read the order + tenant scope check.
    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, status, deleted_at, event_date")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || (order as any).deleted_at) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (order as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }
    if ((order as any).status === "cancelled") {
      return res.status(409).json({ error: "Order is already cancelled" });
    }

    // Pull the refund snapshot via RPC.
    const { data: snapshot, error: snapErr } = await ssr.rpc("get_refund_for_order", {
      p_order_id: orderId,
    });
    if (snapErr) return res.status(500).json({ error: snapErr.message });
    const snap = (snapshot as any) || {};

    // Late-cancel gate: only owners can cancel inside the override window
    // unless they explicitly opt in via bypass_late_guard.
    if (snap.requires_owner_override && !OWNER_ROLES.has(role)) {
      return res.status(403).json({
        error: "This is a late cancellation -- needs an owner to approve.",
        snapshot: snap,
      });
    }
    if (snap.requires_owner_override && OWNER_ROLES.has(role) && !bypass_late_guard) {
      return res.status(409).json({
        error: "Confirm the late-cancellation override to proceed.",
        snapshot: snap,
        requires_confirmation: true,
      });
    }

    const refund_calc = Number(snap.refund_amount) || 0;
    const refund_final =
      refund_override !== null && refund_override >= 0 ? Number(refund_override) : refund_calc;

    // Run the cancelOrder workflow (status, cascades, audit, notifications).
    // Pass the ssr client so the UPDATE runs as the authenticated user
    // -- the imported browser supabase has no session in this context
    // and would hit "permission denied for table orders" via RLS.
    const result = await cancelOrder(orderId, {
      reason: reason || undefined,
      reason_category,
      cancelled_by_user_id: user.id,
      client: ssr,
    });
    if (!result.success) {
      return res.status(500).json({ error: result.error || "Cancel failed" });
    }

    // Insert the cancellation_requests row (the audit + policy snapshot).
    const { data: requestRow, error: reqErr } = await ssr
      .from("cancellation_requests")
      .insert({
        company_id: (order as any).company_id,
        order_id: orderId,
        request_type: "cancel",
        cancellation_type: "immediate",
        status: refund_final > 0 ? "approved" : "completed",
        reason,
        requested_by_user_id: user.id,
        reviewed_by_user_id: user.id,
        reviewed_at: new Date().toISOString(),
        policy_snapshot: snap.policy_snapshot ?? snap,
        refund_amount_calculated: refund_calc,
        refund_amount_approved: refund_final,
        applied_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (reqErr) {
      // Don't unwind the cancel for an audit-row failure; log and move on.
      console.warn("[orders/cancel] cancellation_requests insert failed:", reqErr);
    }

    // Refund record. Only inserted when there's something to refund.
    // Phase 2A migrated reads to payment_status; Phase 4B drops the legacy text column.
    let refundPaymentId: string | null = null;
    if (refund_final > 0) {
      const { data: payRow, error: payErr } = await ssr
        .from("payments")
        .insert({
          company_id: (order as any).company_id,
          order_id: orderId,
          payment_type: "refund",
          amount: refund_final,
          payment_status: "pending",
          reason: `Cancellation refund (${snap.tier_label || "tier"}, ${snap.refund_pct ?? 0}% of paid)`,
          created_by_user_id: user.id,
          cancellation_request_id: (requestRow as any)?.id || null,
        } as any)
        .select("id")
        .single();
      if (payErr) {
        console.warn("[orders/cancel] refund payments row failed:", payErr);
      } else {
        refundPaymentId = (payRow as any)?.id || null;

        // Order-level status alignment so reporting reflects refund state.
        await ssr.from("orders").update({
          payment_status: refund_final >= Number(snap.total_amount_paid || 0)
            ? "refunded"
            : "partially_refunded",
        } as any).eq("id", orderId);
      }
    }

    // Templated cancellation email with the refund amount and timeline.
    // bypassQuarantine=true so a quarantined client still hears about
    // their cancelled order. blocked_contacts still blocks (deliberate).
    void sendCancellationEmail(orderId, refund_final);

    return res.status(200).json({
      ok: true,
      refund_amount: refund_final,
      refund_payment_id: refundPaymentId,
      cancellation_request_id: (requestRow as any)?.id || null,
      snapshot: snap,
    });
  } catch (err: any) {
    console.error("[orders/cancel] crashed:", err);
    return res.status(500).json({ error: err?.message || "Cancellation failed" });
  }
}
