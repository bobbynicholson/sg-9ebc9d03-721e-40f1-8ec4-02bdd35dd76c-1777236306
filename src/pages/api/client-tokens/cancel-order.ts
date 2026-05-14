/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/client-tokens/cancel-order
 *
 * Wave 20 audit: the magic-link /c/order/[id] page had no Cancel /
 * Postpone button -- only the auth-gated client portal exposed those
 * actions. A client who reached their order via the magic-link email
 * had to either sign in (extra friction, not always possible) or
 * phone the caterer.
 *
 * This endpoint mirrors /api/orders/cancellation-request (which
 * requires Supabase auth) but accepts the per-order client_access_token
 * cookie set by /api/client-tokens/validate as the auth surface
 * instead. Same shape: writes a pending row to cancellation_requests,
 * fans the operator notification chain, sends the customer
 * acknowledgement email.
 *
 * Body:
 *   { order_id, request_type, requested_postpone_date?, reason?, client_notes? }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
    const order_id = String(body.order_id || "").trim();
    const request_type = String(body.request_type || "").trim();
    const reason = body.reason ? String(body.reason).slice(0, 1000) : null;
    const client_notes = body.client_notes ? String(body.client_notes).slice(0, 2000) : null;
    const requested_postpone_date = body.requested_postpone_date
      ? String(body.requested_postpone_date)
      : null;

    if (!order_id || !/^[0-9a-f-]{36}$/i.test(order_id)) {
      return res.status(400).json({ error: "valid order_id required" });
    }
    if (!["cancel", "postpone"].includes(request_type)) {
      return res.status(400).json({ error: "request_type must be 'cancel' or 'postpone'" });
    }
    if (request_type === "postpone" && !requested_postpone_date) {
      return res.status(400).json({ error: "requested_postpone_date is required for postpone" });
    }

    // Token-bearer auth: the per-order cookie OR the account-scope
    // cookie set by /api/client-tokens/validate. Re-use client_view_order
    // to validate -- if it returns ok, the token is valid for THIS
    // order under the right tenant + matching client email.
    const cookieName = `cms_client_token_${order_id}`;
    const tokenHash = (
      req.cookies?.[cookieName] ||
      req.cookies?.cms_client_account_token ||
      ""
    ).trim();
    if (!tokenHash) {
      return res.status(401).json({ error: "Open the order link from your email first" });
    }

    const sb = getServiceSupabase();
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.socket as any)?.remoteAddress ||
      null;
    const ua = (req.headers["user-agent"] as string) || null;

    const { data: viewData, error: viewErr } = await (sb as any).rpc("client_view_order", {
      p_token_hash: tokenHash,
      p_order_id: order_id,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (viewErr) {
      console.error("[cancel-order:token] view RPC failed:", viewErr);
      return res.status(500).json({ error: "Lookup failed" });
    }
    const view: any = viewData;
    if (!view?.ok) {
      return res.status(401).json({ error: view?.code || "invalid_token" });
    }
    const order: any = view.order;
    if (order.status === "cancelled") {
      return res.status(409).json({ error: "Order is already cancelled" });
    }
    if (order.status === "completed" || order.status === "delivered") {
      return res.status(409).json({ error: `Cannot cancel a ${order.status} order. Please contact us about a refund.` });
    }

    // Refund snapshot at request time so the admin sees what the
    // client was shown when they hit submit.
    const { data: snapshot, error: snapErr } = await (sb as any).rpc("get_refund_for_order", {
      p_order_id: order_id,
    });
    if (snapErr) {
      console.error("[cancel-order:token] refund RPC failed:", snapErr);
      return res.status(500).json({ error: "Refund preview failed" });
    }
    const snap = (snapshot as any) || {};

    if (request_type === "postpone" && !snap.can_postpone) {
      return res.status(409).json({
        error: `Postponements need at least ${snap.postponement_notice_days || 14} days' notice. Please contact us to discuss.`,
      });
    }

    // Reject duplicates -- prevents the client mash-clicking Cancel
    // and spawning N pending rows on the same order.
    const { data: existing } = await sb
      .from("cancellation_requests")
      .select("id")
      .eq("order_id", order_id)
      .eq("status", "pending")
      .limit(1);
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: "There's already a pending request on this order. We'll come back to you shortly.",
        request_id: (existing[0] as any).id,
      });
    }

    const { data: inserted, error: insertErr } = await sb
      .from("cancellation_requests")
      .insert({
        company_id: order.company_id,
        order_id,
        request_type,
        cancellation_type: request_type === "cancel" ? "client_request" : "postpone_request",
        status: "pending",
        reason,
        feedback: client_notes,
        // Token-bearer flow has no auth.users -- requested_by_user_id
        // stays null. cancellation-review's notify path falls back to
        // resolveClientUserId via orders.client_id when this is null.
        requested_by_user_id: null,
        user_id: null,
        requested_postpone_date,
        policy_snapshot: snap.policy_snapshot ?? snap,
        refund_amount_calculated: Number(snap.refund_amount) || 0,
      } as any)
      .select("id")
      .single();
    if (insertErr) {
      console.error("[cancel-order:token] insert failed:", insertErr);
      return res.status(500).json({ error: insertErr.message });
    }

    // Fan the operator notification chain. Same shape as the
    // auth-gated handler so admins see the request the same way.
    try {
      const { notificationService } = await import("@/services/notificationService");
      const { UserRole } = await import("@/types/app");
      await (notificationService as any).broadcastNotification({
        companyId: order.company_id,
        type: request_type === "cancel" ? "cancellation_requested" : "postponement_requested",
        title: request_type === "cancel" ? "Cancellation requested (magic link)" : "Postponement requested (magic link)",
        message:
          request_type === "cancel"
            ? `${order.client_name || "A client"} wants to cancel order ${order.order_number}. Refund per policy: ${order.currency || "ZAR"} ${(Number(snap.refund_amount) || 0).toFixed(2)}.`
            : `${order.client_name || "A client"} wants to postpone order ${order.order_number} to ${requested_postpone_date}. Review and approve.`,
        priority: "high",
        link: `/admin/orders?orderId=${order_id}&cancellation=${(inserted as any).id}`,
        relatedEntityType: "order",
        relatedEntityId: order_id,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as any,
        ],
      });
    } catch (e) {
      console.warn("[cancel-order:token] notify failed:", e);
    }

    // Acknowledgement email to the client. Best-effort.
    try {
      if (order.client_email) {
        const { emailService } = await import("@/services/emailService");
        const subject =
          request_type === "cancel"
            ? `Cancellation request received -- ${order.order_number}`
            : `Postponement request received -- ${order.order_number}`;
        const evtDate = order.event_date
          ? new Date(order.event_date).toLocaleDateString("en-ZA", {
              day: "numeric", month: "short", year: "numeric",
            })
          : "TBD";
        const body =
          `Hi ${(order.client_name || "there").split(" ")[0]},\n\n` +
          (request_type === "cancel"
            ? `We've received your cancellation request for order ${order.order_number} (${evtDate}). The team will review and come back to you shortly.\n\n`
            : `We've received your postponement request for order ${order.order_number} (${evtDate}) to ${requested_postpone_date}. The team will confirm shortly.\n\n`) +
          `Reply to this email if anything else needs to change.\n\n` +
          `Thanks.`;
        await (emailService as any).sendEmail({
          companyId: order.company_id,
          to: order.client_email,
          subject,
          body,
          bypassQuarantine: true,
          _client: sb,
        });
      }
    } catch (e) {
      console.warn("[cancel-order:token] ack email failed:", e);
    }

    return res.status(201).json({
      ok: true,
      request_id: (inserted as any).id,
      refund_preview: Number(snap.refund_amount) || 0,
      currency: order.currency || "ZAR",
    });
  } catch (e: any) {
    console.error("[cancel-order:token] crashed:", e);
    return res.status(500).json({ error: e?.message || "Cancellation request failed" });
  }
}
