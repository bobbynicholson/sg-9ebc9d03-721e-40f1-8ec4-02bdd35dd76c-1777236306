/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/client-tokens/cancel-order
 *
 * Wave 20 audit: the magic-link /c/order/[id] page had no Cancel /
 * Postpone button - only the auth-gated client portal exposed those
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
 *   { order_id, request_type, requested_postpone_date?, reason?, client_notes?,
 *     // Wave 28.4/28.5: wizard payload. When present + outside the
 *     // owner-override window, runs the cancel cascade immediately
 *     // (auto-processed) instead of queueing a pending row.
 *     payout_choice?: 'refund'|'credit',
 *     credit_amount?: number,
 *     committed_cost_note?: string,
 *     reason_category?: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { consumeApiKeyRateLimitDb } from "@/lib/apiKeyRateLimit";
import crypto from "node:crypto";
import { withApiLogging } from "@/lib/withApiLogging";


async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    // to validate - if it returns ok, the token is valid for THIS
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

    // Wave 24: rate-limit per (IP, order_id). Token is verified per-
    // call below, but a stolen cookie + order_id pair could otherwise
    // be used to spam cancellation/postponement requests, bloating
    // the operator notification queue + audit_logs table. 5 / min /
    // (IP, order) is plenty for real "I changed my mind, request a
    // postpone" use.
    const ipForRl =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.socket as any)?.remoteAddress ||
      "unknown";
    const rlKey = crypto
      .createHash("sha256")
      .update(`cancel-order:${ipForRl}:${order_id}`)
      .digest("hex");
    try {
      const rl = await consumeApiKeyRateLimitDb(sb, rlKey, { maxPerMinute: 5 });
      if (!rl.allowed) {
        return res.status(429).json({ error: "Too many requests, please wait a moment" });
      }
    } catch {
      // Limiter init failure shouldn't block legitimate traffic.
    }
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

    // Reject duplicates - prevents the client mash-clicking Cancel
    // and spawning N pending rows on the same order.
    const { data: existing, error: existingErr } = await sb
      .from("cancellation_requests")
      .select("id")
      .eq("order_id", order_id)
      .eq("status", "pending")
      .limit(1);
    if (existingErr) {
      console.error("[client-tokens/cancel-order] cancellation_requests fetch failed:", existingErr);
    }
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: "There's already a pending request on this order. We'll come back to you shortly.",
        request_id: (existing[0] as any).id,
      });
    }

    // ============================================================
    // Wave 28.5: AUTO-PROCESS branch.
    // When the policy says we're outside the owner-override window
    // AND the wizard sent a payout choice, run the full cancel
    // cascade right now instead of queueing a pending row. This is
    // Bobby's "first line of defence" - the system handles cancels
    // before the catering company is on the phone.
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
      payout_choice_raw !== undefined; // wizard sent a choice

    if (canAutoProcess) {
      try {
        const { runAutoCancel } = await import(
          "@/services/cancellation/runAutoCancel"
        );
        const result = await runAutoCancel({
          supabase: sb,
          orderId: order_id,
          companyId: order.company_id,
          cancelledByUserId: null, // magic-link flow has no auth.users.id
          clientId: order.client_id || null,
          snap,
          reason,
          reasonCategory: reason_category,
          payoutChoice: payout_choice,
          creditAmountIn: credit_amount_in,
          committedCostNote: committed_cost_note,
          requestedBy: "client",
        });
        return res.status(200).json({ ...result, currency: order.currency || "ZAR" });
      } catch (e: any) {
        console.error("[cancel-order:token] auto-process failed:", e);
        // Fall through to the pending queue path below so the request
        // doesn't disappear - the admin can still pick it up.
      }
    }

    // Wave 32: persist the wizard's payout_choice into the snapshot
    // sidecar so the operator approving via /admin/orders ->
    // Cancellations tab honours the client's pick instead of
    // defaulting to refund. Mirrors the auth-portal endpoint.
    const enriched_snapshot = {
      ...(snap.policy_snapshot ?? snap),
      _payout_choice: payout_choice_raw !== undefined ? payout_choice : null,
      _credit_amount: payout_choice === "credit" ? credit_amount_in : null,
      _committed_cost_note: committed_cost_note,
      _requested_by: "client",
    };
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
        // Token-bearer flow has no auth.users - requested_by_user_id
        // stays null. cancellation-review's notify path falls back to
        // resolveClientUserId via orders.client_id when this is null.
        requested_by_user_id: null,
        user_id: null,
        requested_postpone_date,
        policy_snapshot: enriched_snapshot,
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
      }, sb);
    } catch (e) {
      console.warn("[cancel-order:token] notify failed:", e);
    }

    // Acknowledgement email to the client. Best-effort.
    try {
      if (order.client_email) {
        const { emailService } = await import("@/services/emailService");
        const subject =
          request_type === "cancel"
            ? `Cancellation request received - ${order.order_number}`
            : `Postponement request received - ${order.order_number}`;
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

    // Wave 23.5: cross-cutting audit_logs row so the platform-wide
    // audit feed has the request alongside everything else touching
    // this order. cancellation_requests is the domain table; this is
    // the cross-entity trail.
    void (async () => {
      try {
        await (sb as any).from("audit_logs").insert({
          company_id: order.company_id,
          user_id: null, // public token-bearer flow - no auth user
          action: request_type === "cancel" ? "cancellation_requested_magic" : "postponement_requested_magic",
          entity_type: "order",
          entity_id: order_id,
          details: {
            request_id: (inserted as any).id,
            order_number: order.order_number,
            client_email: order.client_email,
            request_type,
            requested_postpone_date,
            refund_preview: Number(snap.refund_amount) || 0,
            reason: reason || null,
          },
        });
      } catch (auditErr) {
        console.warn("[cancel-order:token] audit_logs insert failed:", auditErr);
      }
    })();

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

export default withApiLogging(handler);
