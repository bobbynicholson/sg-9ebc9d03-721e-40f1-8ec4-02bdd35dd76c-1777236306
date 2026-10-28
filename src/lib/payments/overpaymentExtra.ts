/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Money a client paid on top of what an invoice owed.
 *
 *   credit -> a completed credit_issue for the client, used on a later
 *             invoice. The invoice ledger ignores credit_issue rows, so
 *             the caller records only what was owed against the invoice.
 *   refund -> a pending refund on the invoice for Refunds & Credits to
 *             pay out. The caller records the full amount received, and
 *             the refund nets the extra back out once it is paid.
 *
 * `key` makes the write safe to retry: a second call with the same key
 * returns the row the first call wrote.
 */
export type ExtraHandling = "credit" | "refund";

export function parseExtraHandling(value: unknown): ExtraHandling | null {
  return value === "credit" || value === "refund" ? value : null;
}

export async function recordOverpaymentExtra(admin: any, p: {
  companyId: string;
  clientId: string | null;
  orderId: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  extra: number;
  received: number;
  owed: number;
  handling: ExtraHandling;
  currency: string;
  userId: string | null;
  key: string;
}): Promise<{ id: string | null; error: string | null; existed?: boolean }> {
  const { data: existing, error: readErr } = await admin.from("payments")
    .select("id")
    .eq("company_id", p.companyId)
    .eq("transaction_id", p.key)
    .maybeSingle();
  if (readErr) return { id: null, error: readErr.message || "Could not check for an earlier entry" };
  if (existing?.id) return { id: existing.id, error: null, existed: true };

  const reason = `Client paid R ${p.received.toFixed(2)} on invoice ${p.invoiceNumber || p.invoiceId}; R ${p.owed.toFixed(2)} was owed.`;
  const { data, error } = await admin.from("payments").insert({
    company_id: p.companyId,
    client_id: p.clientId,
    order_id: p.orderId,
    // Credit belongs to the client, not this invoice; a refund is owed
    // against this invoice's money.
    invoice_id: p.handling === "refund" ? p.invoiceId : null,
    payment_type: p.handling === "credit" ? "credit_issue" : "refund",
    amount: Number(p.extra.toFixed(2)),
    currency: p.currency,
    payment_status: p.handling === "credit" ? "completed" : "pending",
    reason: p.handling === "credit" ? `Overpayment kept as credit. ${reason}` : `Overpayment to refund. ${reason}`,
    created_by_user_id: p.userId,
    gateway: "manual",
    gateway_provider: "manual",
    transaction_id: p.key,
    gateway_transaction_id: p.key,
  }).select("id").single();
  if (error) return { id: null, error: error.message || "Insert failed" };
  return { id: data?.id ?? null, error: null };
}

export function extraNotSavedMessage(extra: number, handling: ExtraHandling): string {
  return `The payment was recorded, but the extra R ${extra.toFixed(2)} could not be saved as ${handling === "credit" ? "client credit" : "a refund"}. Add it on Refunds & Credits.`;
}
