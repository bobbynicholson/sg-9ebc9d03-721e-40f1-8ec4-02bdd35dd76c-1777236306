/**
 * POST /api/orders/cancellation-request
 *
 * Client-facing endpoint to request to cancel or postpone a confirmed
 * order. Lands as a pending cancellation_requests row for the catering
 * team to review. Approval kicks off the cancel cascade + refund.
 *
 * Body:
 *   {
 *     order_id: string,
 *     request_type: 'cancel' | 'postpone',
 *     requested_postpone_date?: string,  // YYYY-MM-DD, required for postpone
 *     reason?: string,
 *     client_notes?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to request a cancellation" });

    const body = (req.body || {}) as any;
    const order_id = String(body.order_id || "");
    const request_type = String(body.request_type || "");
    const reason = body.reason ? String(body.reason) : null;
    const client_notes = body.client_notes ? String(body.client_notes) : null;
    const requested_postpone_date = body.requested_postpone_date
      ? String(body.requested_postpone_date)
      : null;

    if (!order_id) return res.status(400).json({ error: "order_id is required" });
    if (!["cancel", "postpone"].includes(request_type)) {
      return res.status(400).json({ error: "request_type must be 'cancel' or 'postpone'" });
    }
    if (request_type === "postpone" && !requested_postpone_date) {
      return res.status(400).json({ error: "requested_postpone_date is required for postpone" });
    }

    // Order ownership + scope check.
    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, client_id, event_date, status, deleted_at")
      .eq("id", order_id)
      .maybeSingle();
    if (!order || (order as any).deleted_at) {
      return res.status(404).json({ error: "Order not found" });
    }
    if ((order as any).status === "cancelled") {
      return res.status(409).json({ error: "Order is already cancelled" });
    }

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id, email")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    const isAdminInCompany =
      ["super_admin", "company_admin", "admin", "owner"].includes(role) &&
      (profile as any)?.company_id === (order as any).company_id;

    // orders.client_id is a FK to clients.id (NOT auth.users.id), so
    // resolve ownership through the clients table -- match either
    // clients.user_id = auth.uid() OR clients.email = auth.email().
    let isLinkedClient = false;
    if (!isAdminInCompany && (order as any).client_id) {
      const { data: clientRow } = await ssr
        .from("clients")
        .select("id, user_id, email")
        .eq("id", (order as any).client_id)
        .maybeSingle();
      if (clientRow) {
        const cr = clientRow as any;
        const userEmail = (user.email || (profile as any)?.email || "").toLowerCase().trim();
        const clientEmail = (cr.email || "").toLowerCase().trim();
        isLinkedClient =
          (cr.user_id && cr.user_id === user.id) ||
          (!!userEmail && !!clientEmail && userEmail === clientEmail);
      }
    }

    if (!isAdminInCompany && !isLinkedClient) {
      console.warn("[cancellation-request] ownership denied", {
        order_id,
        user_id: user.id,
        order_client_id: (order as any).client_id,
      });
      return res.status(403).json({ error: "Not allowed to request cancellation on this order" });
    }

    // Snapshot policy + refund preview at request time so the admin sees
    // what the client was shown when they hit submit.
    const { data: snapshot, error: snapErr } = await ssr.rpc("get_refund_for_order", {
      p_order_id: order_id,
    });
    if (snapErr) return res.status(500).json({ error: snapErr.message });
    const snap = (snapshot as any) || {};

    // Postponement gate: refuse inside the notice window unless admin.
    if (request_type === "postpone" && !isAdminInCompany && !snap.can_postpone) {
      return res.status(409).json({
        error: `Postponements need at least ${snap.postponement_notice_days || 14} days' notice. Please contact us to discuss.`,
      });
    }

    // Don't allow duplicate active requests on the same order.
    const { data: existing } = await ssr
      .from("cancellation_requests")
      .select("id, status")
      .eq("order_id", order_id)
      .in("status", ["pending"])
      .limit(1);
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: "There's already a pending request on this order. Wait for the team to review it.",
        request_id: (existing[0] as any).id,
      });
    }

    const { data: inserted, error } = await ssr
      .from("cancellation_requests")
      .insert({
        company_id: (order as any).company_id,
        order_id,
        request_type,
        cancellation_type: request_type === "cancel" ? "client_request" : "postpone_request",
        status: "pending",
        reason,
        feedback: client_notes,
        requested_by_user_id: user.id,
        user_id: user.id,
        requested_postpone_date,
        policy_snapshot: snap.policy_snapshot ?? snap,
        refund_amount_calculated: Number(snap.refund_amount) || 0,
      } as any)
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Notify the catering team. Broadcast to admin/owner roles --
    // previous code used company_id as recipient_id which never
    // matched any actual user, so the notification was invisible.
    try {
      const { notificationService } = await import("@/services/notificationService");
      const { UserRole } = await import("@/types/app");
      await notificationService.broadcastNotification({
        companyId: (order as any).company_id,
        type: request_type === "cancel" ? "cancellation_requested" : "postponement_requested",
        title: request_type === "cancel" ? "Cancellation requested" : "Postponement requested",
        message:
          request_type === "cancel"
            ? `A client wants to cancel a confirmed order. Refund per policy: R${(Number(snap.refund_amount) || 0).toFixed(2)}.`
            : `A client wants to postpone a confirmed order to ${requested_postpone_date}. Review and approve.`,
        priority: "high",
        link: `/admin/orders?orderId=${order_id}&cancellation=${(inserted as any).id}`,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as UserRole,
        ],
      });
    } catch (e) {
      console.warn("[cancellation-request] notify failed:", e);
    }

    return res.status(200).json({
      ok: true,
      request_id: (inserted as any).id,
      refund_preview: snap,
    });
  } catch (err: any) {
    console.error("[cancellation-request] crashed:", err);
    return res.status(500).json({ error: err?.message || "Could not submit cancellation request" });
  }
}
