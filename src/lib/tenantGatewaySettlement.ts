/* eslint-disable @typescript-eslint/no-explicit-any */
/** Service-only settlement of authenticated provider callbacks/API history. */
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
  return data as { order: any | null; duplicate: boolean; payment_id: string; invoice_id: string | null;
    order_id: string | null; amount_paid: number; balance_due: number; overpayment_amount: number };
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
