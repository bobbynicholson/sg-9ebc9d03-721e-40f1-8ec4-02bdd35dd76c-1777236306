/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reconcile an order invoice after a gateway payment. Order payment RPCs
 * create the ledger row but do not update the linked invoice. This helper
 * links that row and rebuilds invoice totals from completed payments, so
 * a webhook retry can repair a failure between those writes safely.
 */
interface ReconcileArgs {
  orderId: string;
  invoiceId?: string | null;
  /** Amount paid in major units; used to reject incomplete callback data. */
  amount: number;
  gatewayTransactionId: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function reconcileInvoiceForOrderPayment(
  sb: any,
  { orderId, invoiceId, amount, gatewayTransactionId }: ReconcileArgs,
): Promise<void> {
  const paid = Number(amount);
  if (!Number.isFinite(paid) || paid <= 0) {
    throw new Error("Cannot reconcile an invalid payment amount");
  }

  let targetInvoiceId = invoiceId && UUID_RE.test(invoiceId) ? invoiceId : null;
  if (!targetInvoiceId) {
    const { data: openInvoice, error } = await sb
      .from("invoices")
      .select("id")
      .eq("order_id", orderId)
      .neq("status", "paid")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    targetInvoiceId = openInvoice?.id || null;
  }
  if (!targetInvoiceId) return;

  const { data: invoice, error: invoiceError } = await sb
    .from("invoices")
    .select("id, order_id, total_amount, amount_paid, status")
    .eq("id", targetInvoiceId)
    .maybeSingle();
  if (invoiceError) throw invoiceError;
  if (!invoice || (invoice.order_id && invoice.order_id !== orderId)) {
    throw new Error("Payment invoice does not match the order");
  }

  for (const column of ["gateway_transaction_id", "transaction_id"]) {
    const { error } = await sb
      .from("payments")
      .update({ invoice_id: targetInvoiceId })
      .eq(column, gatewayTransactionId)
      .is("invoice_id", null);
    if (error) throw error;
  }

  const { data: paymentRows, error: paymentRowsError } = await sb
    .from("payments")
    .select("amount, payment_status")
    .eq("invoice_id", targetInvoiceId);
  if (paymentRowsError) throw paymentRowsError;

  const paidFromLedger = (paymentRows || []).reduce((sum: number, row: any) => {
    const status = String(row.payment_status || "").toLowerCase();
    return ["completed", "paid", "succeeded"].includes(status)
      ? sum + (Number(row.amount) || 0)
      : sum;
  }, 0);
  const totalAmount = Number(invoice.total_amount) || 0;
  const amountPaid = Math.round(Math.max(Number(invoice.amount_paid) || 0, paidFromLedger) * 100) / 100;
  const balanceDue = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);
  const status = balanceDue < 0.01 ? "paid" : amountPaid > 0 ? "partially_paid" : "sent";
  const patch: Record<string, unknown> = {
    amount_paid: amountPaid,
    balance_due: balanceDue,
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "paid") patch.paid_at = new Date().toISOString();

  const { error: updateError } = await sb
    .from("invoices")
    .update(patch)
    .eq("id", targetInvoiceId);
  if (updateError) throw updateError;
}
