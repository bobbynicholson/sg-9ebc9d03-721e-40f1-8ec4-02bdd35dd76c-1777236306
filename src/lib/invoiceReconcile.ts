/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reconcile the INVOICE row after a gateway deposit/balance payment on
 * an ORDER.
 *
 * record_order_payment (the order-side RPC every gateway webhook calls)
 * only updates orders.payment_status / amount_paid -- it never touches
 * the linked invoice. Without this, a client who paid a deposit/balance
 * invoice via Yoco or Stripe leaves the invoice stuck at 'sent' with the
 * full balance_due forever: the admin invoice list and the public
 * /pay/i/{token} link both keep showing it unpaid, so the client can pay
 * a SECOND time. The PayFast IPN handler has always done this inline
 * (payment-confirmation.ts); this helper is the shared, verbatim
 * extraction so Yoco + Stripe get the identical behaviour.
 *
 * Contract:
 *   - Best-effort + never throws. The order side is already settled by
 *     the time this runs, so a failure here is a reconciliation gap
 *     (loggable, sweeper-recoverable), not lost money.
 *   - Idempotent by construction: callers invoke it only on the first,
 *     non-duplicate processing of a gateway transaction (the webhook
 *     dedups on gateway_transaction_id before reaching here), and the
 *     payment-row link is guarded on invoice_id IS NULL.
 *   - Amount is in major units (rands), matching how invoices.amount_paid
 *     / total_amount / balance_due are stored across this codebase.
 */

interface ReconcileArgs {
  /** The order the gateway payment settled. */
  orderId: string;
  /** Preferred invoice id (from gateway metadata.invoiceId). Optional. */
  invoiceId?: string | null;
  /** Amount just paid via the gateway, in rands (major units). */
  amount: number;
  /** Gateway transaction id, used to link the existing payment row. */
  gatewayTransactionId: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function reconcileInvoiceForOrderPayment(
  sb: any,
  { orderId, invoiceId, amount, gatewayTransactionId }: ReconcileArgs,
): Promise<void> {
  try {
    const paid = Number(amount);
    if (!Number.isFinite(paid) || paid <= 0) return;

    // Resolve the target invoice: the id the pay session carried, or
    // fall back to the order's earliest still-open invoice.
    let targetInvoiceId: string | null =
      invoiceId && UUID_RE.test(invoiceId) ? invoiceId : null;
    if (!targetInvoiceId) {
      const { data: openInv } = await sb
        .from("invoices")
        .select("id")
        .eq("order_id", orderId)
        .neq("status", "paid")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      targetInvoiceId = (openInv as any)?.id || null;
    }
    if (!targetInvoiceId) return;

    const { data: inv } = await sb
      .from("invoices")
      .select("id, total_amount, amount_paid, status")
      .eq("id", targetInvoiceId)
      .maybeSingle();
    if (!inv) return;

    const invData = inv as any;
    const newAmountPaid =
      Math.round(((Number(invData.amount_paid) || 0) + paid) * 100) / 100;
    const newBalance = Math.max(
      0,
      Math.round(((Number(invData.total_amount) || 0) - newAmountPaid) * 100) / 100,
    );
    // < 1c tolerance mirrors record_invoice_payment so float drift on
    // inc-VAT deposit splits doesn't leave it stuck at partial.
    const nextStatus =
      newBalance < 0.01 ? "paid" : newAmountPaid > 0 ? "partially_paid" : "sent";
    const invUpdate: any = {
      amount_paid: newAmountPaid,
      balance_due: newBalance,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === "paid") invUpdate.paid_at = new Date().toISOString();
    await sb.from("invoices").update(invUpdate).eq("id", targetInvoiceId);

    // Link the gateway payment row to the invoice for ledger
    // completeness (record_order_payment leaves invoice_id null).
    await sb
      .from("payments")
      .update({ invoice_id: targetInvoiceId })
      .eq("gateway_transaction_id", gatewayTransactionId)
      .is("invoice_id", null);
  } catch (err) {
    console.warn("[invoiceReconcile] invoice reconcile failed (non-blocking):", err);
  }
}
