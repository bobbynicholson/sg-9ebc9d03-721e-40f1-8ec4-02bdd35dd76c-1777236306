/* eslint-disable @typescript-eslint/no-explicit-any */
/** Service-only settlement of authenticated provider callbacks/API history. */
import { recordOverpaymentExtra } from "@/lib/payments/overpaymentExtra";
export type TenantGatewayProvider = "payfast" | "yoco" | "stripe";
export class TenantGatewaySettlementError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = "TenantGatewaySettlementError";
  }
}
export interface VerifiedPayment {
  provider: TenantGatewayProvider;
  transactionId: string;
  companyId: string;
  orderId: string;
  paymentType: string;
  invoiceId?: string | null;
  attemptId?: string | null;
  amount: number;
  currency?: string | null;
}
export async function applyVerifiedPayment(admin: any, payment: VerifiedPayment, eventId: string) {
  const { data, error } = await admin.rpc("settle_verified_gateway_payment", {
    p_provider: payment.provider, p_transaction_id: payment.transactionId,
    p_company_id: payment.companyId, p_reference_id: payment.orderId,
    p_payment_type: payment.paymentType, p_invoice_id: payment.invoiceId || null,
    p_attempt_id: payment.attemptId || null, p_amount: payment.amount,
    p_currency: payment.currency || "ZAR", p_event_id: eventId,
  });
  if (error) {
    throw new TenantGatewaySettlementError(error.message || "Payment settlement failed",
      error.code === "22023" ? 400 : error.code === "23505" ? 409 : 503);
  }
  if (!data?.payment_id) throw new TenantGatewaySettlementError("Settlement did not commit", 503);
  // The deposit changes what remains payable, not when the event balance
  // falls due. Refresh legacy invoice dates after successful settlement.
  try {
    const { reconcileCompanyInvoiceDueDates } = await import("@/services/invoiceDueDateService");
    if (data.order_id) await reconcileCompanyInvoiceDueDates(admin, payment.companyId, { orderId: data.order_id });
  } catch (error) {
    // Settlement already committed; never turn a date-refresh failure into
    // a failed payment. The guarded reminder/overdue jobs retry the repair.
    console.error("[gateway-settlement] balance due-date refresh failed:", error);
  }
  if (!data.duplicate && Number(data.overpayment_amount) > 0.01 && data.invoice_id) {
    await queueGatewayOverpaymentRefund(admin, payment, data);
  }
  return data as { order: any | null; duplicate: boolean; payment_id: string; invoice_id: string | null;
    order_id: string | null; amount_paid: number; balance_due: number; overpayment_amount: number };
}
/**
 * A gateway settled more than the invoice balance (rare: checkout caps the
 * amount). The money is recorded in full; queue a pending refund for the
 * extra on Refunds & Credits so it is never left as an unexplained surplus.
 * Capped at this payment's own amount and net of refunds already open, so a
 * webhook retry or an earlier overpayment never queues it twice.
 * Best effort: the settlement has committed and must not fail here.
 */
async function queueGatewayOverpaymentRefund(admin: any, payment: VerifiedPayment, data: any) {
  try {
    let q = admin.from("payments").select("amount")
      .eq("company_id", payment.companyId)
      .eq("payment_type", "refund")
      .in("payment_status", ["pending", "processing", "failed"]);
    q = data.order_id ? q.or(`invoice_id.eq.${data.invoice_id},order_id.eq.${data.order_id}`) : q.eq("invoice_id", data.invoice_id);
    const { data: open, error } = await q;
    if (error) throw error;
    const openAmount = (open || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const extra = Number(Math.min(payment.amount, Math.max(0, Number(data.overpayment_amount) - openAmount)).toFixed(2));
    if (extra <= 0.01) return;
    const { data: invoice } = await admin.from("invoices").select("invoice_number, client_id, order_id")
      .eq("id", data.invoice_id).maybeSingle();
    const saved = await recordOverpaymentExtra(admin, {
      companyId: payment.companyId,
      clientId: invoice?.client_id ?? null,
      orderId: invoice?.order_id ?? data.order_id ?? null,
      invoiceId: data.invoice_id,
      invoiceNumber: invoice?.invoice_number ?? null,
      extra,
      received: payment.amount,
      owed: Number((payment.amount - extra).toFixed(2)),
      handling: "refund",
      currency: String(payment.currency || "ZAR").toUpperCase(),
      userId: null,
      key: `gateway-overpayment:${data.payment_id}`,
    });
    if (saved.error) console.error("[gateway-settlement] overpayment refund not queued:", saved.error);
  } catch (error) {
    console.error("[gateway-settlement] overpayment refund not queued:", error);
  }
}
export async function settleTenantGatewayPayment(input: VerifiedPayment & { admin: any; paymentAttempt?: any }) {
  const { admin, paymentAttempt, ...values } = input;
  const amount = Number(values.amount);
  if (!values.transactionId || !Number.isFinite(amount) || amount <= 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    throw new TenantGatewaySettlementError("Invalid payment transaction or amount");
  }
  if (paymentAttempt && (paymentAttempt.company_id !== values.companyId ||
      paymentAttempt.provider !== values.provider || paymentAttempt.payment_type !== values.paymentType ||
      Math.round(amount * 100) !== Math.round(Number(paymentAttempt.amount) * 100) ||
      String(values.currency || "ZAR").toUpperCase() !== String(paymentAttempt.currency).toUpperCase())) {
    throw new TenantGatewaySettlementError("Payment does not match saved checkout");
  }
  const payment: VerifiedPayment = { ...values, amount, attemptId: paymentAttempt?.id || values.attemptId || null };
  // Only call this after authenticating the provider. No secrets/raw personal
  // callback data are stored. Never replace the first verified event on retry.
  const { error: saveError } = await admin.from("payment_gateway_events").upsert({
    company_id: payment.companyId, provider: payment.provider,
    transaction_id: payment.transactionId, payload: payment,
  }, { onConflict: "provider,transaction_id", ignoreDuplicates: true });
  if (saveError) throw new TenantGatewaySettlementError("Could not persist verified callback", 503);
  const { data: event, error: eventError } = await admin.from("payment_gateway_events")
    .select("id, company_id, payload").eq("provider", payment.provider)
    .eq("transaction_id", payment.transactionId).single();
  if (eventError || !event) throw new TenantGatewaySettlementError("Could not load verified callback", 503);
  if (event.company_id !== payment.companyId ||
      Number(event.payload?.amount) !== amount || event.payload?.orderId !== payment.orderId ||
      event.payload?.paymentType !== payment.paymentType ||
      String(event.payload?.currency || "ZAR").toUpperCase() !== String(payment.currency || "ZAR").toUpperCase()) {
    throw new TenantGatewaySettlementError("Transaction already belongs to another payment", 409);
  }
  try {
    return await applyVerifiedPayment(admin, payment, event.id);
  } catch (error: any) {
    await admin.from("payment_gateway_events").update({ last_error: String(error.message).slice(0, 500),
      last_checked_at: new Date().toISOString() }).eq("id", event.id).is("processed_at", null);
    throw error;
  }
}
