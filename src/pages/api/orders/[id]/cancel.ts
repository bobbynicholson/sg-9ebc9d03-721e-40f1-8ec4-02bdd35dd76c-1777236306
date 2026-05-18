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
 *     bypass_late_guard?: boolean, // owner-only escape hatch
 *     // Wave 28.2: payout choice. 'refund' (default) preserves legacy
 *     // behaviour - inserts a payments{type:refund,pending} row and
 *     // calls refundService.processRefund. 'credit' instead inserts a
 *     // payments{type:credit_issue,completed} row, no Xero credit-note
 *     // is pushed, and the client confirmation email switches to the
 *     // store-credit copy. credit_amount lets the caller carry over
 *     // the +bonus_pp goodwill amount computed by the wizard --
 *     // server falls back to refund_calc * (creditPct/refundPct) when
 *     // omitted so admin-side cancels with no wizard still work.
 *     payout_choice?: 'refund' | 'credit',
 *     credit_amount?: number,
 *     committed_cost_note?: string,
 *     requested_by?: 'admin' | 'client'
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
    // Wave 28.2: payout selection. Defaults to 'refund' so legacy
    // callers (admin one-click cancel before the wizard ships) keep
    // their existing behaviour.
    const payout_choice: "refund" | "credit" =
      body.payout_choice === "credit" ? "credit" : "refund";
    const credit_amount_in =
      body.credit_amount !== undefined ? Number(body.credit_amount) : null;
    const committed_cost_note = body.committed_cost_note
      ? String(body.committed_cost_note)
      : null;
    const requested_by: "admin" | "client" =
      body.requested_by === "client" ? "client" : "admin";

    if (!VALID_CATEGORIES.has(reason_category)) {
      return res.status(400).json({ error: "Invalid reason_category" });
    }

    // Read the order + tenant scope check.
    // Wave 28.2: also pull client_id so credit-payout rows attach to
    // the right client wallet (read via getClientCreditBalance).
    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, status, deleted_at, event_date, client_id")
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
        error: "This is a late cancellation - needs an owner to approve.",
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

    // Wave 28.2: derive credit_final. The wizard sends credit_amount
    // already inflated by the goodwill bonus; admin-side cancels may
    // omit it, in which case we re-derive from policy.credit_bonus_pct
    // so the credit row never lands at 0 when refund_final > 0.
    const policy_obj = (snap.policy_snapshot as any) || {};
    const bonus_pp = Math.max(0, Math.min(100, Number(policy_obj.credit_bonus_pct ?? 10)));
    const refund_pct = Number(snap.refund_pct) || 0;
    const credit_pct = Math.min(100, refund_pct + bonus_pp);
    const base_paid = Math.max(
      Number(snap.deposit_paid_amount) || 0,
      Number(snap.total_amount_paid) || 0,
    );
    const derived_credit = Math.round(base_paid * (credit_pct / 100) * 100) / 100;
    const credit_final =
      credit_amount_in !== null && credit_amount_in >= 0
        ? Number(credit_amount_in)
        : derived_credit;

    // Run the cancelOrder workflow (status, cascades, audit, notifications).
    // Pass the ssr client so the UPDATE runs as the authenticated user
    // - the imported browser supabase has no session in this context
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
    // Wave 28.2: payout_choice + committed_cost_note ride along in the
    // policy_snapshot.* sidecar so the audit row carries the full
    // wizard context without a schema change.
    const enriched_snapshot = {
      ...(snap.policy_snapshot ?? snap),
      _payout_choice: payout_choice,
      _committed_cost_note: committed_cost_note,
      _requested_by: requested_by,
      _credit_amount: payout_choice === "credit" ? credit_final : 0,
      _refund_amount: payout_choice === "refund" ? refund_final : 0,
    };
    const { data: requestRow, error: reqErr } = await ssr
      .from("cancellation_requests")
      .insert({
        company_id: (order as any).company_id,
        order_id: orderId,
        request_type: "cancel",
        cancellation_type: "immediate",
        status:
          payout_choice === "credit"
            ? "completed"
            : refund_final > 0
              ? "approved"
              : "completed",
        reason,
        requested_by_user_id: user.id,
        reviewed_by_user_id: user.id,
        reviewed_at: new Date().toISOString(),
        policy_snapshot: enriched_snapshot,
        refund_amount_calculated: refund_calc,
        refund_amount_approved: payout_choice === "refund" ? refund_final : 0,
        applied_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (reqErr) {
      // Don't unwind the cancel for an audit-row failure; log and move on.
      console.warn("[orders/cancel] cancellation_requests insert failed:", reqErr);
    }

    // ============================================================
    // Wave 28.2: branch on payout_choice
    // ============================================================
    let refundPaymentId: string | null = null;
    let creditPaymentId: string | null = null;

    if (payout_choice === "credit" && credit_final > 0) {
      // Issue store credit - single payments row, no external gateway,
      // no Xero credit-note (the catering company keeps the cash;
      // the client gets a future-dated voucher).
      const { data: credRow, error: credErr } = await ssr
        .from("payments")
        .insert({
          company_id: (order as any).company_id,
          order_id: orderId,
          client_id: (order as any).client_id || null,
          payment_type: "credit_issue",
          amount: credit_final,
          payment_status: "completed",
          reason: `Cancellation credit (${snap.tier_label || "tier"}, ${credit_pct}% of paid${
            bonus_pp > 0 ? ` - includes ${bonus_pp}pp goodwill bonus` : ""
          })`,
          created_by_user_id: user.id,
          cancellation_request_id: (requestRow as any)?.id || null,
        } as any)
        .select("id")
        .single();
      if (credErr) {
        console.warn("[orders/cancel] credit_issue payments row failed:", credErr);
      } else {
        creditPaymentId = (credRow as any)?.id || null;
        // Mark the order as fully reconciled via credit - nothing
        // further is owed either way. Reuses the existing 'refunded'
        // status so reporting stays consistent (a credit issue is
        // economically equivalent to a refund the client immediately
        // re-spent on a future booking).
        await ssr.from("orders").update({
          payment_status: "refunded",
        } as any).eq("id", orderId);
      }

      // Audit row - separate from cancellation_requests so the
      // credit issuance shows up in the order's audit_logs timeline.
      try {
        await (ssr as any).from("audit_logs").insert({
          company_id: (order as any).company_id,
          order_id: orderId,
          user_id: user.id,
          action: "cancellation_credit_issued",
          entity_type: "payments",
          entity_id: creditPaymentId,
          metadata: {
            credit_amount: credit_final,
            credit_pct,
            bonus_pp,
            tier_label: snap.tier_label,
            requested_by,
          },
        });
      } catch (e) {
        console.warn("[orders/cancel] audit_logs insert (credit) failed:", e);
      }
    } else if (payout_choice === "refund" && refund_final > 0) {
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

        // Phase 2 #6: auto-process the refund right now. cancellation-
        // review.ts already does this; the admin-side cancel endpoint
        // was inserting the pending payments row and walking away,
        // which meant operators had to manually retry every cancellation
        // through /admin/refunds. processRefund is idempotent and
        // gracefully falls back to pending_manual when the parent
        // payment wasn't PayFast (EFT, cash, etc.).
        if (refundPaymentId) {
          try {
            const { refundService } = await import("@/services/refundService");
            const refundResult = await refundService.processRefund(refundPaymentId, user.id);
            // We don't block the cancel response on the processing
            // outcome - the cancellation already landed and the
            // refund row exists. Operators see the eventual status
            // via /admin/refunds.
            console.log("[orders/cancel] refund process result:", refundResult.status);
          } catch (e) {
            console.warn("[orders/cancel] processRefund crashed (non-blocking):", e);
          }
        }

        // Fire-and-forget credit-note push to Xero (P1-24). Endpoint
        // handles "no Xero connected" / "invoice never synced" cases
        // gracefully with 409s; we don't block the cancel on the
        // accounting integration. CRON_SECRET shared header is the
        // same pattern as the auto-invoice push.
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && refundPaymentId) {
          const proto = (req.headers["x-forwarded-proto"] as string) || "https";
          const host = req.headers.host;
          const baseUrl = host ? `${proto}://${host}` : "";
          if (baseUrl) {
            void fetch(`${baseUrl}/api/accounting/xero/sync-credit-note`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-cms-internal": cronSecret },
              body: JSON.stringify({ refund_payment_id: refundPaymentId }),
            }).catch((e) => console.warn("[orders/cancel] xero credit-note fire failed:", e));
          }
        }
      }
    }

    // Wave 70.51b - Xero original-invoice void. Fires UNCONDITIONALLY
    // for cancelled orders (not just refund-path) because the local
    // cascade marked unpaid invoices status='voided' regardless of
    // payout choice, and the Xero side needs to mirror that.
    //
    // The /void-invoices endpoint:
    //   - Reads invoices for this order with status='voided' and
    //     external_id set
    //   - Skips any with amount_paid > 0 (Xero rejects VOID on paid
    //     invoices - credit-note path handles those)
    //   - POSTs Xero VOID for the rest, stamps xero_voided_at
    //
    // Together with the credit-note push (which runs only on the
    // refund branch above), this closes the audit gap:
    //   - Paid + refund: credit-note (existing path) + invoice stays
    //     AUTHORISED in Xero (correct - it WAS issued and paid;
    //     credit-note is the offset)
    //   - Unpaid: Xero invoice VOIDED (new) - ledger now matches
    //     CateringMS's "this never happened" intent
    //
    // Fire-and-forget on CRON_SECRET like sync-credit-note. Re-reading
    // the env here (rather than reusing the locally-scoped const above)
    // because that one lives inside the refund-payout block.
    const voidCronSecret = process.env.CRON_SECRET;
    if (voidCronSecret) {
      const proto = (req.headers["x-forwarded-proto"] as string) || "https";
      const host = req.headers.host;
      const baseUrl = host ? `${proto}://${host}` : "";
      if (baseUrl) {
        void fetch(`${baseUrl}/api/accounting/xero/void-invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cms-internal": voidCronSecret },
          body: JSON.stringify({ order_id: orderId }),
        }).catch((e) => console.warn("[orders/cancel] xero void-invoices fire failed:", e));
      }
    }

    // Templated cancellation email - swap to credit-paragraph variant
    // when the client picked credit, otherwise keep the refund copy.
    // bypassQuarantine=true so a quarantined client still hears about
    // their cancelled order. blocked_contacts still blocks (deliberate).
    if (payout_choice === "credit" && credit_final > 0) {
      void sendCancellationEmail(orderId, 0, { creditAmount: credit_final });
    } else {
      void sendCancellationEmail(orderId, refund_final);
    }

    // Wave 28.6: rich admin notification. Single card with payout +
    // committed cost + freed slot, dedup'd within 60min.
    void (async () => {
      try {
        const { data: orderRow } = await ssr
          .from("orders")
          .select("order_number, client_name, event_date, currency")
          .eq("id", orderId)
          .maybeSingle();
        const { fireRichCancellationNotification } = await import(
          "@/services/cancellation/fireCancellationNotification"
        );
        await fireRichCancellationNotification({
          supabase: ssr,
          orderId,
          companyId: (order as any).company_id,
          orderNumber: (orderRow as any)?.order_number || null,
          clientName: (orderRow as any)?.client_name || null,
          eventDate: (orderRow as any)?.event_date || null,
          daysToEvent: Number(snap.days_to_event) || 0,
          payoutChoice: payout_choice,
          refundAmount: payout_choice === "refund" ? refund_final : 0,
          creditAmount: payout_choice === "credit" ? credit_final : 0,
          committedCostNote: committed_cost_note,
          requestedBy: requested_by,
          currencyCode: (orderRow as any)?.currency || null,
          reason,
        });
      } catch (e) {
        console.warn("[orders/cancel] rich notification failed:", e);
      }
    })();

    // Wave 70.49 - include the release receipt so the calling UI
    // (CancelOrderDialog -> toast) can surface "N manual follow-ups
    // required" the moment the cancel returns. Follow-ups currently
    // captured: notify_hire_supplier (3rd-party rentals we cancelled
    // in our DB but the supplier still needs to be told), and
    // notify_outsource_provider (outsourced caterers we cancelled but
    // who still need a phone call so they don't show up). The full
    // receipt is also embedded in audit_logs.details.release_receipt
    // for any later forensics.
    const followups = ((result as any)?.release_receipt?.lines || [])
      .flatMap((l: any) => (l.followups || []).map((f: any) => ({ ...f, resource: l.resource })));

    return res.status(200).json({
      ok: true,
      payout_choice,
      refund_amount: payout_choice === "refund" ? refund_final : 0,
      credit_amount: payout_choice === "credit" ? credit_final : 0,
      refund_payment_id: refundPaymentId,
      credit_payment_id: creditPaymentId,
      cancellation_request_id: (requestRow as any)?.id || null,
      snapshot: snap,
      release_receipt: (result as any)?.release_receipt || null,
      manual_followups: followups,
    });
  } catch (err: any) {
    console.error("[orders/cancel] crashed:", err);
    return res.status(500).json({ error: err?.message || "Cancellation failed" });
  }
}
