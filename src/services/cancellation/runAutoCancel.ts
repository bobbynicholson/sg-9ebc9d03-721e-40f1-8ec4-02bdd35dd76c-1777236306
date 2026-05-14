/**
 * Wave 28.5 -- shared "auto-process the cancel" runner.
 *
 * Bobby's brief: the system handles the cancel BEFORE the catering
 * company picks up the phone. When the policy says it's outside the
 * owner-override window, the wizard's submit fires this helper which
 * runs the same cascade /api/orders/[id]/cancel does -- without
 * needing an admin to approve.
 *
 * Inside the override window we do NOT call this -- the request is
 * queued as a pending cancellation_requests row for admin review,
 * matching the existing flow.
 *
 * Single helper used from BOTH:
 *   - /api/client-tokens/cancel-order   (magic-link, service-role client)
 *   - /api/orders/cancellation-request  (auth client portal, ssr client)
 *
 * Returns enough metadata that the wizard can show "All done" vs
 * "Sent for review" without a follow-up fetch.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelOrder } from "@/services/order/orderWorkflow";
import { sendCancellationEmail } from "@/services/email/cancellationEmails";

export interface AutoCancelInput {
  supabase: SupabaseClient;
  orderId: string;
  companyId: string;
  /** auth.users.id when available -- null for magic-link token-bearer flows. */
  cancelledByUserId: string | null;
  /** Optional client_id for credit attachment (orders.client_id). */
  clientId: string | null;
  /** Refund snapshot from get_refund_for_order RPC. */
  snap: any;
  /** Free-text reason from wizard step 1. */
  reason: string | null;
  /** Reason category key, e.g. "event_postponed". */
  reasonCategory: string;
  /** Wizard payout pick. */
  payoutChoice: "refund" | "credit";
  /** Wizard's pre-computed credit amount (already inflated by bonus). */
  creditAmountIn: number | null;
  /** Optional committed-cost note shown in admin UI. */
  committedCostNote: string | null;
  /** 'admin' or 'client' -- audit trail flavour. */
  requestedBy: "admin" | "client";
}

export interface AutoCancelResult {
  ok: true;
  auto_processed: true;
  payout_choice: "refund" | "credit";
  refund_amount: number;
  credit_amount: number;
  refund_payment_id: string | null;
  credit_payment_id: string | null;
  cancellation_request_id: string | null;
}

export async function runAutoCancel(
  input: AutoCancelInput,
): Promise<AutoCancelResult> {
  const sb = input.supabase as any;
  const snap = input.snap || {};

  // Derive amounts. Mirror the math /api/orders/[id]/cancel uses.
  const refund_calc = Number(snap.refund_amount) || 0;
  const policy_obj = (snap.policy_snapshot as any) || {};
  const bonus_pp = Math.max(
    0,
    Math.min(100, Number(policy_obj.credit_bonus_pct ?? 10)),
  );
  const refund_pct = Number(snap.refund_pct) || 0;
  const credit_pct = Math.min(100, refund_pct + bonus_pp);
  const base_paid = Math.max(
    Number(snap.deposit_paid_amount) || 0,
    Number(snap.total_amount_paid) || 0,
  );
  const derived_credit = Math.round(base_paid * (credit_pct / 100) * 100) / 100;
  const credit_final =
    input.creditAmountIn !== null && input.creditAmountIn >= 0
      ? Number(input.creditAmountIn)
      : derived_credit;
  const refund_final = refund_calc;

  // 1. Run the cascade. Idempotent on repeat -- cancelOrder bails
  // early when status is already 'cancelled'.
  const result = await cancelOrder(input.orderId, {
    reason: input.reason || undefined,
    reason_category: input.reasonCategory || "client_cancelled",
    cancelled_by_user_id: input.cancelledByUserId || undefined,
    client: input.supabase,
  });
  if (!result.success) {
    throw new Error(result.error || "Cancel cascade failed");
  }

  // 2. Audit row (cancellation_requests) -- carries payout_choice +
  // committed_cost_note in the policy_snapshot sidecar so the audit
  // trail is complete without a schema change.
  const enriched_snapshot = {
    ...(snap.policy_snapshot ?? snap),
    _payout_choice: input.payoutChoice,
    _committed_cost_note: input.committedCostNote,
    _requested_by: input.requestedBy,
    _credit_amount: input.payoutChoice === "credit" ? credit_final : 0,
    _refund_amount: input.payoutChoice === "refund" ? refund_final : 0,
    _auto_processed: true,
  };
  const { data: requestRow } = await sb
    .from("cancellation_requests")
    .insert({
      company_id: input.companyId,
      order_id: input.orderId,
      request_type: "cancel",
      cancellation_type: "immediate",
      status: "completed",
      reason: input.reason,
      requested_by_user_id: input.cancelledByUserId,
      reviewed_by_user_id: input.cancelledByUserId,
      reviewed_at: new Date().toISOString(),
      policy_snapshot: enriched_snapshot,
      refund_amount_calculated: refund_calc,
      refund_amount_approved:
        input.payoutChoice === "refund" ? refund_final : 0,
      applied_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // 3. Payout branch.
  let refund_payment_id: string | null = null;
  let credit_payment_id: string | null = null;

  if (input.payoutChoice === "credit" && credit_final > 0) {
    const { data: credRow, error: credErr } = await sb
      .from("payments")
      .insert({
        company_id: input.companyId,
        order_id: input.orderId,
        client_id: input.clientId,
        payment_type: "credit_issue",
        amount: credit_final,
        payment_status: "completed",
        reason: `Cancellation credit (${snap.tier_label || "tier"}, ${credit_pct}% of paid${
          bonus_pp > 0 ? ` -- includes ${bonus_pp}pp goodwill bonus` : ""
        })`,
        created_by_user_id: input.cancelledByUserId,
        cancellation_request_id: requestRow?.id || null,
      })
      .select("id")
      .single();
    if (credErr) {
      console.warn("[runAutoCancel] credit_issue insert failed:", credErr);
    } else {
      credit_payment_id = credRow?.id || null;
      await sb
        .from("orders")
        .update({ payment_status: "refunded" })
        .eq("id", input.orderId);
    }
    try {
      await sb.from("audit_logs").insert({
        company_id: input.companyId,
        order_id: input.orderId,
        user_id: input.cancelledByUserId,
        action: "cancellation_credit_issued",
        entity_type: "payments",
        entity_id: credit_payment_id,
        metadata: {
          credit_amount: credit_final,
          credit_pct,
          bonus_pp,
          tier_label: snap.tier_label,
          requested_by: input.requestedBy,
          auto_processed: true,
        },
      });
    } catch (e) {
      console.warn("[runAutoCancel] audit_logs (credit) failed:", e);
    }
  } else if (input.payoutChoice === "refund" && refund_final > 0) {
    const { data: payRow, error: payErr } = await sb
      .from("payments")
      .insert({
        company_id: input.companyId,
        order_id: input.orderId,
        payment_type: "refund",
        amount: refund_final,
        payment_status: "pending",
        reason: `Cancellation refund (${snap.tier_label || "tier"}, ${refund_pct}% of paid)`,
        created_by_user_id: input.cancelledByUserId,
        cancellation_request_id: requestRow?.id || null,
      })
      .select("id")
      .single();
    if (payErr) {
      console.warn("[runAutoCancel] refund insert failed:", payErr);
    } else {
      refund_payment_id = payRow?.id || null;
      await sb
        .from("orders")
        .update({
          payment_status:
            refund_final >= Number(snap.total_amount_paid || 0)
              ? "refunded"
              : "partially_refunded",
        })
        .eq("id", input.orderId);
      // Auto-process refund -- same gateway logic as the admin route.
      if (refund_payment_id) {
        try {
          const { refundService } = await import("@/services/refundService");
          await refundService.processRefund(
            refund_payment_id,
            input.cancelledByUserId || "system",
          );
        } catch (e) {
          console.warn("[runAutoCancel] processRefund crashed:", e);
        }
      }
    }
  }

  // 4. Client confirmation email -- variant follows payout choice.
  try {
    if (input.payoutChoice === "credit" && credit_final > 0) {
      await sendCancellationEmail(input.orderId, 0, {
        creditAmount: credit_final,
      });
    } else {
      await sendCancellationEmail(input.orderId, refund_final);
    }
  } catch (e) {
    console.warn("[runAutoCancel] email failed:", e);
  }

  // 5. Wave 28.6: single rich admin notification. Replaces the
  // generic status-change broadcast. Carries payout amount,
  // committed-cost note, freed-slot line, and a deep link to the
  // order so admins read the consequence in one card.
  try {
    const { data: orderRow } = await sb
      .from("orders")
      .select("order_number, client_name, event_date, currency")
      .eq("id", input.orderId)
      .maybeSingle();
    const { fireRichCancellationNotification } = await import(
      "./fireCancellationNotification"
    );
    await fireRichCancellationNotification({
      supabase: input.supabase,
      orderId: input.orderId,
      companyId: input.companyId,
      orderNumber: orderRow?.order_number || null,
      clientName: orderRow?.client_name || null,
      eventDate: orderRow?.event_date || null,
      daysToEvent: Number(snap.days_to_event) || 0,
      payoutChoice: input.payoutChoice,
      refundAmount: refund_final,
      creditAmount: credit_final,
      committedCostNote: input.committedCostNote,
      requestedBy: input.requestedBy,
      currencyCode: orderRow?.currency || null,
      reason: input.reason,
    });
  } catch (e) {
    console.warn("[runAutoCancel] rich notification failed:", e);
  }

  return {
    ok: true,
    auto_processed: true,
    payout_choice: input.payoutChoice,
    refund_amount: input.payoutChoice === "refund" ? refund_final : 0,
    credit_amount: input.payoutChoice === "credit" ? credit_final : 0,
    refund_payment_id,
    credit_payment_id,
    cancellation_request_id: requestRow?.id || null,
  };
}
