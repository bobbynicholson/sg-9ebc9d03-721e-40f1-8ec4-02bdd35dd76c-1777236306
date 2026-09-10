/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * refundService
 *
 * Orchestrates refund processing for cancellation refunds. Decides
 * whether to push the refund through PayFast's API automatically or
 * leave it for finance to do a manual EFT.
 *
 * Flow:
 *   1. Cancellation approval inserts a `payments` row with
 *      payment_type='refund', status='pending'.
 *   2. processRefund() looks up the parent payment(s) for that order.
 *   3. If the parent gateway is PayFast and we have a PayFast txn id,
 *      we hit the PayFast refunds API. On 2xx we mark the refund row
 *      `completed` with processed_at=now and write an audit row.
 *      On failure we leave the row at `pending` and write an audit row
 *      with the error so finance can retry from /admin/refunds.
 *   4. If the parent was EFT / cash / manual, we leave the refund at
 *      `pending` - finance does the EFT in their bank app and clicks
 *      "Mark refund paid" the way they always have.
 *
 * Idempotent: if the refund row is already `completed` we no-op.
 *
 * Server-only: pulls credentials from the payment_gateway_credentials
 * sibling table via the service-role client. Never call from the
 * browser.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { PayFastService } from "@/lib/payfastService";

export type RefundStatus =
  | "auto_processed"
  | "pending_manual"
  | "auto_failed"
  | "already_completed"
  | "error";

export interface ProcessRefundResult {
  status: RefundStatus;
  refund_payment_id: string;
  message?: string;
  gateway?: string | null;
  payfast_response?: any;
}

/**
 * Detect whether a parent payment row was settled via PayFast. We check
 * both columns - `gateway` (newer) and `gateway_provider` (older
 * mirror) - because the codebase writes one or the other depending on
 * which entry point recorded the payment.
 */
function isPayFastPayment(p: any): boolean {
  const g = String(p?.gateway || "").toLowerCase();
  const gp = String(p?.gateway_provider || "").toLowerCase();
  const pm = String(p?.payment_method || "").toLowerCase();
  return g === "payfast" || gp === "payfast" || pm === "payfast";
}

/**
 * Pick the best PayFast transaction id off a payment row. We try the
 * canonical `gateway_transaction_id` first, then the legacy
 * `transaction_id` mirror, then `payment_reference` as a last resort.
 */
function payFastTxnId(p: any): string | null {
  return (
    p?.gateway_transaction_id ||
    p?.transaction_id ||
    p?.payment_reference ||
    null
  );
}

/**
 * Fetch the company's active PayFast credentials from the
 * payment_gateway_credentials sibling. Returns null if PayFast is not
 * configured (or not active) for the company - in that case we can't
 * push the refund automatically and the caller must fall back to
 * pending-manual.
 */
async function loadPayFastCreds(
  admin: any,
  companyId: string,
): Promise<
  | {
      merchantId: string;
      merchantKey: string;
      passphrase: string;
      isTest: boolean;
    }
  | null
> {
  const { data: gw, error: gwErr } = await admin
    .from("payment_gateways")
    .select("id, is_test, is_active")
    .eq("company_id", companyId)
    .eq("provider", "payfast")
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (gwErr || !gw) return null;

  const { data: credRow, error: credErr } = await admin
    .from("payment_gateway_credentials")
    .select("credentials")
    .eq("gateway_id", gw.id)
    .maybeSingle();
  if (credErr || !credRow) return null;

  const creds = (credRow as any).credentials || {};
  const merchantId = String(creds.merchantId || "").trim();
  const merchantKey = String(creds.merchantKey || "").trim();
  const passphrase = String(creds.passphrase || "").trim();
  if (!merchantId || !merchantKey) return null;

  return {
    merchantId,
    merchantKey,
    passphrase,
    isTest: Boolean(gw.is_test),
  };
}

/**
 * Best-effort audit log write. Never throws - failures are logged
 * but don't unwind the refund processing.
 */
async function writeAudit(
  admin: any,
  params: {
    companyId: string | null;
    actorUserId: string | null;
    action: string;
    entityId: string;
    details: Record<string, any>;
  },
): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      company_id: params.companyId,
      user_id: params.actorUserId,
      action: params.action,
      entity_type: "payment",
      entity_id: params.entityId,
      details: params.details as any,
    } as any);
  } catch (e) {
    console.warn("[refundService] audit insert failed", e);
  }
}

/**
 * Process a single pending refund payment row. Idempotent: if the row
 * is already `completed` we return immediately.
 *
 * actorUserId is the admin who triggered the cancellation approval (or
 * the manual retry click), used for audit attribution. Pass null for
 * cron / system retries.
 */
export async function processRefund(
  refundPaymentId: string,
  actorUserId: string | null = null,
): Promise<ProcessRefundResult> {
  if (!refundPaymentId) {
    return {
      status: "error",
      refund_payment_id: "",
      message: "refund_payment_id is required",
    };
  }

  let admin: any;
  try {
    admin = getServiceSupabase();
  } catch (e: any) {
    return {
      status: "error",
      refund_payment_id: refundPaymentId,
      message: e?.message || "Service client unavailable",
    };
  }

  // 1) Load the refund row.
  const { data: refundRow, error: refundErr } = await admin
    .from("payments")
    .select(
      "id, company_id, order_id, amount, payment_type, payment_status, gateway, gateway_provider, cancellation_request_id, reason",
    )
    .eq("id", refundPaymentId)
    .maybeSingle();
  if (refundErr || !refundRow) {
    return {
      status: "error",
      refund_payment_id: refundPaymentId,
      message: refundErr?.message || "Refund payment row not found",
    };
  }
  if (refundRow.payment_type !== "refund") {
    return {
      status: "error",
      refund_payment_id: refundPaymentId,
      message: "Payment row is not a refund",
    };
  }

  // Idempotency guard. payment_status is the canonical enum column.
  // Phase 4B dropped the legacy text `status` mirror.
  const currentStatus = String(refundRow.payment_status || "");
  if (currentStatus === "completed") {
    return {
      status: "already_completed",
      refund_payment_id: refundPaymentId,
    };
  }

  if (!refundRow.order_id) {
    return {
      status: "error",
      refund_payment_id: refundPaymentId,
      message: "Refund row has no order link",
    };
  }

  // 2) Find the parent payments for the order. We want successful,
  //    non-refund rows so we can establish the original gateway.
  const { data: parents, error: parErr } = await admin
    .from("payments")
    .select(
      "id, amount, gateway, gateway_provider, gateway_transaction_id, transaction_id, payment_reference, payment_method, payment_type, payment_status, processed_at, created_at",
    )
    .eq("order_id", refundRow.order_id)
    .neq("payment_type", "refund")
    .order("created_at", { ascending: false });
  if (parErr) {
    return {
      status: "error",
      refund_payment_id: refundPaymentId,
      message: parErr.message,
    };
  }

  // We only auto-route through PayFast if the most recent successful
  // capture was via PayFast and we can extract a pf_payment_id. Anything
  // else (EFT/cash/manual or no parent) falls back to pending-manual.
  const settledParents = (parents || []).filter((p: any) => {
    const s = String(p.payment_status || "").toLowerCase();
    return s === "completed" || s === "succeeded" || s === "paid";
  });
  const payFastParent = settledParents.find(
    (p: any) => isPayFastPayment(p) && payFastTxnId(p),
  );

  if (!payFastParent) {
    // EFT / cash / manual / no parent - leave at pending and let
    // finance do it the existing way through /admin/refunds.
    return {
      status: "pending_manual",
      refund_payment_id: refundPaymentId,
      gateway: settledParents[0]?.gateway || settledParents[0]?.payment_method || null,
      message: "No PayFast parent payment, refund stays pending for manual EFT",
    };
  }

  const pfPaymentId = payFastTxnId(payFastParent)!;
  const amountRand = Number(refundRow.amount) || 0;
  if (amountRand <= 0) {
    return {
      status: "error",
      refund_payment_id: refundPaymentId,
      message: "Refund amount must be greater than zero",
    };
  }
  // PayFast refund API expects cents (integer). Round to nearest cent.
  const amountCents = Math.round(amountRand * 100);

  // TIGHTEN I.103 (2026-06-02): atomic claim before the external call.
  // Without this guard, two concurrent retries (finance double-click on
  // /admin/refunds, or /api/refunds/[id]/retry racing the auto-fire
  // chained off cancel.ts) could both pass the line-209 idempotency
  // check, both hit PayFast, and refund the merchant twice. The
  // conditional UPDATE flips pending -> processing in one round-trip
  // and only proceeds if THIS request was the one that flipped it.
  const { data: claimed, error: claimErr } = await admin
    .from("payments")
    .update({ payment_status: "processing" } as any)
    .eq("id", refundPaymentId)
    .eq("payment_status", "pending")
    .select("id");
  if (claimErr) {
    return {
      status: "error",
      refund_payment_id: refundPaymentId,
      message: `claim failed: ${claimErr.message}`,
    };
  }
  if (!claimed || claimed.length === 0) {
    // Another worker beat us to it - either already processing or
    // already completed. Surfaces as already_completed so the caller
    // treats the request as idempotently-successful.
    return {
      status: "already_completed",
      refund_payment_id: refundPaymentId,
    };
  }

  // 3) Pull PayFast credentials for this company.
  const creds = await loadPayFastCreds(admin, refundRow.company_id);
  if (!creds) {
    await writeAudit(admin, {
      companyId: refundRow.company_id,
      actorUserId,
      action: "refund_auto_failed",
      entityId: refundPaymentId,
      details: {
        reason: "PayFast credentials missing",
        order_id: refundRow.order_id,
        amount: amountRand,
        pf_payment_id: pfPaymentId,
      },
    });
    return {
      status: "auto_failed",
      refund_payment_id: refundPaymentId,
      gateway: "payfast",
      message: "PayFast credentials missing for this company",
    };
  }

  // 4) Hit the PayFast refunds API.
  const pf = new PayFastService({
    merchantId: creds.merchantId,
    merchantKey: creds.merchantKey,
    passphrase: creds.passphrase,
    testMode: creds.isTest,
  });

  const refundReason =
    refundRow.reason || `Cancellation refund for order ${refundRow.order_id}`;

  const result = await pf.refundTransaction(pfPaymentId, amountCents, refundReason);

  if (!result.ok) {
    // TIGHTEN I.103: revert the claim so finance can retry. Without
    // this the row would stay stuck at 'processing' forever after a
    // single PayFast HTTP failure.
    await admin
      .from("payments")
      .update({ payment_status: "pending" } as any)
      .eq("id", refundPaymentId)
      .eq("payment_status", "processing");
    await writeAudit(admin, {
      companyId: refundRow.company_id,
      actorUserId,
      action: "refund_auto_failed",
      entityId: refundPaymentId,
      details: {
        order_id: refundRow.order_id,
        amount: amountRand,
        pf_payment_id: pfPaymentId,
        gateway: "payfast",
        http_status: result.status,
        error: result.error,
        response: result.body,
      },
    });
    return {
      status: "auto_failed",
      refund_payment_id: refundPaymentId,
      gateway: "payfast",
      message: result.error || "PayFast refund call failed",
      payfast_response: result.body,
    };
  }

  // 5) Success - mark the refund row completed and stamp the gateway.
  // Phase 2A migrated reads to payment_status; Phase 4B drops the legacy text column.
  // TIGHTEN I.103: gate the success flip on payment_status='processing'
  // so we close out OUR claim and never overwrite a row that some
  // other path has already moved on (defensive belt-and-braces).
  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("payments")
    .update({
      payment_status: "completed",
      processed_at: nowIso,
      gateway: "payfast",
      gateway_provider: "payfast",
      gateway_response: result.body ?? null,
      refunded_at: nowIso,
    } as any)
    .eq("id", refundPaymentId)
    .eq("payment_status", "processing");
  if (updErr) {
    // The PayFast call succeeded but our DB update did not. We log
    // loudly - finance can reconcile from the audit row.
    await writeAudit(admin, {
      companyId: refundRow.company_id,
      actorUserId,
      action: "refund_auto_db_update_failed",
      entityId: refundPaymentId,
      details: {
        order_id: refundRow.order_id,
        amount: amountRand,
        pf_payment_id: pfPaymentId,
        error: updErr.message,
        payfast_response: result.body,
      },
    });
    return {
      status: "error",
      refund_payment_id: refundPaymentId,
      gateway: "payfast",
      message: `PayFast refund OK but DB update failed: ${updErr.message}`,
      payfast_response: result.body,
    };
  }

  await writeAudit(admin, {
    companyId: refundRow.company_id,
    actorUserId,
    action: "refund_auto_processed",
    entityId: refundPaymentId,
    details: {
      order_id: refundRow.order_id,
      amount: amountRand,
      pf_payment_id: pfPaymentId,
      gateway: "payfast",
      cancellation_request_id: refundRow.cancellation_request_id,
    },
  });

  // Wave 19 audit: refund_paid email never fired on the auto-processed
  // PayFast path. The /admin/refunds manual-mark-paid flow sends it
  // (via sendRefundPaidEmail), but when PayFast settled the refund
  // automatically the client got nothing - they wondered for days
  // whether the money was coming. Fire the email here so both paths
  // produce the same client-facing outcome. Best-effort: a failed
  // email never undoes a successful refund.
  if (refundRow.order_id) {
    void (async () => {
      try {
        const { sendRefundPaidEmail } = await import("@/services/email/cancellationEmails");
        await sendRefundPaidEmail(refundRow.order_id, amountRand);
      } catch (emailErr) {
        console.warn("[refundService] sendRefundPaidEmail failed (non-blocking):", emailErr);
      }
    })();
  }

  return {
    status: "auto_processed",
    refund_payment_id: refundPaymentId,
    gateway: "payfast",
    payfast_response: result.body,
  };
}

export const refundService = {
  processRefund,
};
