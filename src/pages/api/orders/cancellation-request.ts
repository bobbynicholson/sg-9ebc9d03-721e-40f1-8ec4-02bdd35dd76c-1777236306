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
 *     client_notes?: string,
 *     // Wave 28.5: when wizard payload present + outside the
 *     // owner-override window, auto-processes instead of queueing.
 *     payout_choice?: 'refund' | 'credit',
 *     credit_amount?: number,
 *     committed_cost_note?: string,
 *     reason_category?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
// Static type-only import so we can cite UserRole in casts. The
// runtime value still comes from the dynamic import inside the
// handler. Aliased to avoid clashing with the local const below.
import type { UserRole as UserRoleType } from "@/types/app";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    // resolve ownership through the clients table - match either
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
    if (snapErr) return res.status(500).json({ error: dbErrorMessage(snapErr) });
    const snap = (snapshot as any) || {};

    // Postponement gate: refuse inside the notice window unless admin.
    if (request_type === "postpone" && !isAdminInCompany && !snap.can_postpone) {
      return res.status(409).json({
        error: `Postponements need at least ${snap.postponement_notice_days || 14} days' notice. Please contact us to discuss.`,
      });
    }

    // Don't allow duplicate active requests on the same order.
    const { data: existing, error: existingErr } = await ssr
      .from("cancellation_requests")
      .select("id, status")
      .eq("order_id", order_id)
      .in("status", ["pending"])
      .limit(1);
    if (existingErr) {
      console.error("[orders/cancellation-request] cancellation_requests fetch failed:", existingErr);
    }
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: "There's already a pending request on this order. Wait for the team to review it.",
        request_id: (existing[0] as any).id,
      });
    }

    // ============================================================
    // Wave 28.5: AUTO-PROCESS branch (auth client portal flavour).
    // Same shape as the magic-link endpoint - when the policy says
    // we're outside the owner-override window AND the wizard sent a
    // payout_choice, run the cancel cascade now.
    // ============================================================
    const payout_choice_raw = body.payout_choice;
    const payout_choice: "refund" | "credit" =
      payout_choice_raw === "credit" ? "credit" : "refund";
    const credit_amount_in =
      body.credit_amount !== undefined ? Number(body.credit_amount) : null;
    const committed_cost_note = body.committed_cost_note
      ? String(body.committed_cost_note)
      : null;
    const reason_category = body.reason_category
      ? String(body.reason_category)
      : "client_cancelled";

    const canAutoProcess =
      request_type === "cancel" &&
      !snap.requires_owner_override &&
      payout_choice_raw !== undefined;

    if (canAutoProcess) {
      try {
        const { runAutoCancel } = await import(
          "@/services/cancellation/runAutoCancel"
        );
        const result = await runAutoCancel({
          supabase: ssr,
          orderId: order_id,
          companyId: (order as any).company_id,
          cancelledByUserId: user.id,
          clientId: (order as any).client_id || null,
          snap,
          reason,
          reasonCategory: reason_category,
          payoutChoice: payout_choice,
          creditAmountIn: credit_amount_in,
          committedCostNote: committed_cost_note,
          requestedBy: "client",
        });
        return res.status(200).json(result);
      } catch (e: any) {
        console.error("[cancellation-request] auto-process failed:", e);
        // Fall through to pending queue so the request isn't lost.
      }
    }

    // Wave 32: when the wizard sent a payout_choice but we're inside
    // the override window (so we're queueing instead of auto-
    // processing), persist the choice into the policy_snapshot
    // sidecar so the operator approving via /admin/orders ->
    // Cancellations tab honours the client's pick instead of
    // defaulting to refund.
    const enriched_snapshot = {
      ...(snap.policy_snapshot ?? snap),
      _payout_choice: payout_choice_raw !== undefined ? payout_choice : null,
      _credit_amount: payout_choice === "credit" ? credit_amount_in : null,
      _committed_cost_note: committed_cost_note,
      _requested_by: "client",
    };
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
        policy_snapshot: enriched_snapshot,
        refund_amount_calculated: Number(snap.refund_amount) || 0,
      } as any)
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: dbErrorMessage(error) });

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
        // Source pointer for contextual CTA on notifications page.
        relatedEntityType: "order",
        relatedEntityId: order_id,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as unknown as UserRoleType,
        ],
      });
    } catch (e) {
      console.warn("[cancellation-request] notify failed:", e);
    }

    // Phase 4 #5: customer-facing acknowledgement email. Closes the
    // loop that the toast on the client portal already promises:
    // "we'll come back to you by email shortly". Without this, the
    // customer only ever heard back when the catering team actually
    // approved or rejected - which could be hours.
    //
    // Fire-and-forget; an email failure must not unwind the request
    // row. Pulls the client email off the order so we never expose a
    // staffer's address by mistake.
    try {
      const { data: orderForEmail } = await ssr
        .from("orders")
        .select("order_number, client_name, client_email, event_date, event_time")
        .eq("id", order_id)
        .maybeSingle();
      const clientEmail = (orderForEmail as any)?.client_email;
      if (clientEmail) {
        const { emailService } = await import("@/services/emailService");
        const evtDate = (orderForEmail as any).event_date
          ? new Date((orderForEmail as any).event_date).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "TBD";
        const subject =
          request_type === "cancel"
            ? `Cancellation request received - ${(orderForEmail as any).order_number || "your order"}`
            : `Postponement request received - ${(orderForEmail as any).order_number || "your order"}`;
        const body =
          request_type === "cancel"
            ? `Hi ${(orderForEmail as any).client_name || "there"},\n\nWe've received your request to cancel your booking for ${evtDate}. The team will review and confirm by email shortly.\n\nReference: ${(orderForEmail as any).order_number || order_id}\n\nIf this wasn't you, please reply right away.`
            : `Hi ${(orderForEmail as any).client_name || "there"},\n\nWe've received your request to postpone your booking from ${evtDate} to ${requested_postpone_date}. The team will confirm the new date by email shortly.\n\nReference: ${(orderForEmail as any).order_number || order_id}\n\nIf this wasn't you, please reply right away.`;
        await emailService.sendEmail({
          companyId: (order as any).company_id,
          to: clientEmail,
          subject,
          template: "transactional",
          orderId: order_id,
          variables: {
            clientName: (orderForEmail as any).client_name,
            orderNumber: (orderForEmail as any).order_number,
          },
          html: `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br />")}</p>`,
          text: body,
          _client: ssr,
        } as any);
      }
    } catch (ackErr) {
      console.warn("[cancellation-request] client ack email failed:", ackErr);
    }

    return res.status(200).json({
      ok: true,
      request_id: (inserted as any).id,
      refund_preview: snap,
    });
  } catch (err: any) {
    console.error("[cancellation-request] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Could not submit cancellation request" });
  }
}

export default withApiLogging(handler);
