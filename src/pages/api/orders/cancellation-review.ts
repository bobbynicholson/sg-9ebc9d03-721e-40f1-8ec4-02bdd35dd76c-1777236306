/**
 * POST /api/orders/cancellation-review
 *
 * Admin reviews a pending cancellation/postpone request -- approve or
 * reject. Approval kicks off the cancel cascade + refund, OR stamps the
 * postponement on the order for the postpone path.
 *
 * Body:
 *   {
 *     request_id: string,
 *     action: 'approve' | 'reject',
 *     refund_override?: number,  // for cancel-approve only
 *     review_notes?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { cancelOrder } from "@/services/order/orderWorkflow";
import { sendCancellationEmail, sendPostponementApprovedEmail } from "@/services/email/cancellationEmails";
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";
import { refundService } from "@/services/refundService";

// Send a client-portal notification. Best-effort -- failures are
// logged but never block the review action that called us.
async function notifyClient(
  ssr: any,
  params: {
    companyId: string;
    orderId: string;
    requestedByUserId: string | null;
    actorUserId: string;
    notificationType: string;
    title: string;
    message: string;
    priority?: string;
  },
) {
  try {
    const { data: orderRow } = await ssr
      .from("orders")
      .select("client_id")
      .eq("id", params.orderId)
      .maybeSingle();
    const recipientId =
      params.requestedByUserId || (await resolveClientUserId(ssr, (orderRow as any)?.client_id));
    if (!recipientId) return;
    const { notificationService } = await import("@/services/notificationService");
    await notificationService.createNotification({
      company_id: params.companyId,
      recipient_id: recipientId,
      user_id: params.actorUserId,
      notification_type: params.notificationType,
      title: params.title,
      message: params.message,
      priority: params.priority || "normal",
      link: `/client-portal/my-orders`,
      related_entity_type: "order",
      related_entity_id: params.orderId,
    });
  } catch (e) {
    console.warn("[cancellation-review] notify failed:", e);
  }
}

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
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
    const request_id = String(body.request_id || "");
    const action = String(body.action || "");
    const review_notes = body.review_notes ? String(body.review_notes) : null;
    const refund_override =
      body.refund_override !== undefined ? Number(body.refund_override) : null;

    if (!request_id || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid request_id or action" });
    }

    const { data: request } = await ssr
      .from("cancellation_requests")
      .select("id, order_id, company_id, request_type, requested_postpone_date, status, refund_amount_calculated, reason, requested_by_user_id")
      .eq("id", request_id)
      .maybeSingle();
    if (!request) return res.status(404).json({ error: "Request not found" });
    if ((request as any).status !== "pending") {
      return res.status(409).json({ error: `Request is already ${(request as any).status}` });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (request as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }

    const nowIso = new Date().toISOString();

    if (action === "reject") {
      await ssr.from("cancellation_requests").update({
        status: "rejected",
        reviewed_by_user_id: user.id,
        reviewed_at: nowIso,
        review_notes,
      } as any).eq("id", request_id);

      const isPostpone = (request as any).request_type === "postpone";
      await notifyClient(ssr, {
        companyId: (request as any).company_id,
        orderId: (request as any).order_id,
        requestedByUserId: (request as any).requested_by_user_id || null,
        actorUserId: user.id,
        notificationType: isPostpone ? "postponement_rejected" : "cancellation_rejected",
        title: isPostpone ? "Postponement declined" : "Cancellation declined",
        message: review_notes
          ? `We couldn't approve the request. Reason from the team: ${review_notes}`
          : "We couldn't approve the request. Please get in touch and we'll work it out.",
        priority: "high",
      });

      return res.status(200).json({ ok: true, action: "rejected" });
    }

    // ---- Approve path -----------------------------------------------------

    if ((request as any).request_type === "postpone") {
      // Stamp the postponement onto the order. We don't actually move
      // event_date here, the admin/client will agree on a new date and
      // it gets set via the existing amendment flow. We just record
      // that the postpone was approved + the original date.
      const { data: order } = await ssr
        .from("orders")
        .select("event_date")
        .eq("id", (request as any).order_id)
        .maybeSingle();
      const originalDate = (order as any)?.event_date || null;

      const updates: any = {
        postponed_at: nowIso,
        postponed_from_date: originalDate,
      };
      if ((request as any).requested_postpone_date) {
        updates.event_date = (request as any).requested_postpone_date;
      }

      const { error: orderErr } = await ssr.from("orders").update(updates).eq("id", (request as any).order_id);
      if (orderErr) return res.status(500).json({ error: orderErr.message });

      await ssr.from("cancellation_requests").update({
        status: "approved",
        reviewed_by_user_id: user.id,
        reviewed_at: nowIso,
        review_notes,
        applied_at: nowIso,
      } as any).eq("id", request_id);

      void sendPostponementApprovedEmail((request as any).order_id, updates.event_date || null);

      await notifyClient(ssr, {
        companyId: (request as any).company_id,
        orderId: (request as any).order_id,
        requestedByUserId: (request as any).requested_by_user_id || null,
        actorUserId: user.id,
        notificationType: "postponement_approved",
        title: "Postponement approved",
        message: updates.event_date
          ? `Your event has been moved to ${updates.event_date}. Open your order to confirm the details.`
          : "Your postponement was approved. We'll be in touch to lock in the new date.",
      });

      return res.status(200).json({
        ok: true,
        action: "postponed",
        new_event_date: updates.event_date || null,
      });
    }

    // request_type === 'cancel'
    // Pull a fresh refund snapshot so policy changes between request +
    // review are picked up.
    const { data: snapshot, error: snapErr } = await ssr.rpc("get_refund_for_order", {
      p_order_id: (request as any).order_id,
    });
    if (snapErr) return res.status(500).json({ error: snapErr.message });
    const snap = (snapshot as any) || {};
    const refund_calc = Number(snap.refund_amount) || 0;
    const refund_final =
      refund_override !== null && refund_override >= 0 ? Number(refund_override) : refund_calc;

    const cancelResult = await cancelOrder((request as any).order_id, {
      reason: (request as any).reason || review_notes || "Client-requested cancellation",
      reason_category: "client_cancelled",
      cancelled_by_user_id: user.id,
      client: ssr,
    });
    if (!cancelResult.success) {
      return res.status(500).json({ error: cancelResult.error || "Cancel failed" });
    }

    await ssr.from("cancellation_requests").update({
      status: "approved",
      reviewed_by_user_id: user.id,
      reviewed_at: nowIso,
      review_notes,
      applied_at: nowIso,
      refund_amount_calculated: refund_calc,
      refund_amount_approved: refund_final,
      policy_snapshot: snap.policy_snapshot ?? snap,
    } as any).eq("id", request_id);

    let refundPaymentId: string | null = null;
    let refundStatus: "auto_processed" | "pending_manual" | "auto_failed" | null = null;
    if (refund_final > 0) {
      const { data: payRow } = await ssr.from("payments").insert({
        company_id: (request as any).company_id,
        order_id: (request as any).order_id,
        payment_type: "refund",
        amount: refund_final,
        status: "pending",
        reason: `Cancellation refund (client-requested, ${snap.refund_pct ?? 0}% of paid)`,
        created_by_user_id: user.id,
        cancellation_request_id: request_id,
      } as any).select("id").single();
      refundPaymentId = (payRow as any)?.id || null;

      await ssr.from("orders").update({
        payment_status: refund_final >= Number(snap.total_amount_paid || 0)
          ? "refunded"
          : "partially_refunded",
      } as any).eq("id", (request as any).order_id);

      // Auto-route through PayFast when the parent capture was via
      // PayFast. EFT / cash / manual stay pending for the existing
      // /admin/refunds mark-paid flow. Awaited so the operator's
      // response reflects what actually happened.
      if (refundPaymentId) {
        try {
          const refundResult = await refundService.processRefund(refundPaymentId, user.id);
          if (refundResult.status === "auto_processed") {
            refundStatus = "auto_processed";
          } else if (refundResult.status === "auto_failed") {
            refundStatus = "auto_failed";
          } else {
            // pending_manual / already_completed / error -> all surface
            // to the operator as pending so finance can decide.
            refundStatus = "pending_manual";
          }
        } catch (e) {
          console.warn("[cancellation-review] refundService threw:", e);
          refundStatus = "pending_manual";
        }
      }
    }

    void sendCancellationEmail((request as any).order_id, refund_final);

    await notifyClient(ssr, {
      companyId: (request as any).company_id,
      orderId: (request as any).order_id,
      requestedByUserId: (request as any).requested_by_user_id || null,
      actorUserId: user.id,
      notificationType: "cancellation_approved",
      title: "Cancellation approved",
      message: refund_final > 0
        ? `Your order is cancelled. A refund of R${refund_final.toFixed(2)} is on the way.`
        : "Your order is cancelled. No refund applies under our cancellation policy.",
    });

    return res.status(200).json({
      ok: true,
      action: "cancelled",
      refund_amount: refund_final,
      refund_payment_id: refundPaymentId,
      refund_status: refundStatus,
    });
  } catch (err: any) {
    console.error("[cancellation-review] crashed:", err);
    return res.status(500).json({ error: err?.message || "Cancellation review failed" });
  }
}
