/* eslint-disable @typescript-eslint/no-explicit-any */
/** Service-role settlement for signed tenant Yoco / Stripe webhooks. */

import { reconcileInvoiceForOrderPayment } from "@/lib/invoiceReconcile";

export type TenantGatewayProvider = "yoco" | "stripe";

export class TenantGatewaySettlementError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "TenantGatewaySettlementError";
    this.statusCode = statusCode;
  }
}

interface SettleInput {
  admin: any;
  provider: TenantGatewayProvider;
  transactionId: string;
  companyId: string;
  orderId: string;
  paymentType: string;
  invoiceId?: string | null;
  paymentAttempt?: any;
  amount: number;
  currency?: string | null;
}

export async function settleTenantGatewayPayment(input: SettleInput): Promise<{
  order: any | null;
  duplicate: boolean;
}> {
  const { admin, provider, transactionId, companyId, orderId, paymentType, paymentAttempt } = input;
  const amount = Number(input.amount);
  if (!transactionId || !Number.isFinite(amount) || amount <= 0) {
    throw new TenantGatewaySettlementError("Payment is missing a valid transaction ID or amount");
  }
  if (paymentAttempt && (
    paymentAttempt.company_id !== companyId ||
    paymentAttempt.provider !== provider ||
    paymentAttempt.payment_type !== paymentType ||
    (input.currency && paymentAttempt.currency && String(paymentAttempt.currency).toUpperCase() !== String(input.currency).toUpperCase()) ||
    Math.abs(amount - Number(paymentAttempt.amount)) > 0.01
  )) {
    throw new TenantGatewaySettlementError("Payment does not match the saved checkout attempt");
  }

  if (paymentType === "invoice") {
    const invoiceId = paymentAttempt?.invoice_id || input.invoiceId || orderId;
    if (!invoiceId || (paymentAttempt && (paymentAttempt.order_id || paymentAttempt.invoice_id !== invoiceId))) {
      throw new TenantGatewaySettlementError("Invoice does not match the saved checkout attempt");
    }
    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id, company_id, client_id, order_id, currency, total_amount, amount_paid, balance_due, status, deleted_at")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceError) throw new TenantGatewaySettlementError("Could not load the payment invoice", 500);
    if (!invoice || invoice.deleted_at || invoice.company_id !== companyId) {
      throw new TenantGatewaySettlementError("Payment invoice does not belong to this company");
    }
    if (paymentAttempt && orderId !== invoice.id) {
      throw new TenantGatewaySettlementError("Invoice reference does not match the checkout");
    }

    const prior = await findGatewayPayment(admin, transactionId);
    if (prior) {
      assertExistingPayment(prior, {
        companyId,
        invoiceId,
        orderId: invoice.order_id,
        amount,
        provider,
      });
      return { order: null, duplicate: true };
    }

    const outstanding = invoice.balance_due !== null && invoice.balance_due !== undefined
      ? Number(invoice.balance_due)
      : Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0));
    // Once a hosted session is created, its amount is immutable. Two valid
    // sessions can finish concurrently; record both real charges even if the
    // first one just closed the invoice. Legacy callbacks without an attempt
    // still have to fit within the current outstanding balance.
    if (!paymentAttempt && (outstanding <= 0 || amount > outstanding + 0.01)) {
      throw new TenantGatewaySettlementError("Payment exceeds the invoice balance");
    }

    const { error: recordError } = await admin.rpc("record_invoice_payment", {
      p_invoice_id: invoiceId,
      p_amount: amount,
      p_payment_method: provider,
      p_transaction_id: transactionId,
      p_company_id: companyId,
      p_client_id: invoice.client_id,
      p_currency: input.currency || invoice.currency || "ZAR",
      p_gateway_provider: provider,
    });
    if (recordError) throw new TenantGatewaySettlementError("Failed to record invoice payment", 500);
    return { order: null, duplicate: false };
  }

  if (paymentType !== "deposit" && paymentType !== "balance") {
    throw new TenantGatewaySettlementError("Unsupported payment type");
  }
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (orderError) throw new TenantGatewaySettlementError("Could not load the payment order", 500);
  if (!order || String(order.company_id || order.user_id || "") !== companyId) {
    throw new TenantGatewaySettlementError("Payment order does not belong to this company");
  }
  if (paymentAttempt && paymentAttempt.order_id !== orderId) {
    throw new TenantGatewaySettlementError("Order does not match the saved checkout attempt");
  }

  const invoiceId = paymentAttempt?.invoice_id || input.invoiceId || null;
  let invoice: any = null;
  if (invoiceId) {
    const { data, error } = await admin
      .from("invoices")
      .select("id, company_id, order_id, total_amount, amount_paid, balance_due, status, deleted_at")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error) throw new TenantGatewaySettlementError("Could not load the payment invoice", 500);
    if (!data || data.deleted_at || data.company_id !== companyId || (data.order_id && data.order_id !== orderId)) {
      throw new TenantGatewaySettlementError("Payment invoice does not belong to this order");
    }
    invoice = data;
  } else {
    const { data, error } = await admin
      .from("invoices")
      .select("id, company_id, order_id, total_amount, amount_paid, balance_due, status, deleted_at")
      .eq("order_id", orderId)
      .eq("company_id", companyId)
      .neq("status", "paid")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new TenantGatewaySettlementError("Could not load the payment invoice", 500);
    invoice = data;
  }

  const prior = await findGatewayPayment(admin, transactionId);
  const duplicate = !!prior;
  if (prior) {
    assertExistingPayment(prior, {
      companyId,
      invoiceId: invoice?.id || null,
      orderId,
      amount,
      provider,
    });
  }

  const invoiceBalance = invoice
    ? invoice.balance_due !== null && invoice.balance_due !== undefined
      ? Number(invoice.balance_due)
      : Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0))
    : null;
  const orderBalance = paymentType === "deposit"
    ? Number(order.deposit_amount) || Number(order.total_amount) || 0
    : Number(order.balance_amount) || Math.max(0, Number(order.total_amount || 0) - Number(order.amount_paid || 0));
  const outstanding = invoiceBalance === null ? orderBalance : invoiceBalance;
  if (!duplicate && !paymentAttempt && (outstanding <= 0 || amount > outstanding + 0.01)) {
    throw new TenantGatewaySettlementError("Payment exceeds the outstanding order balance");
  }

  if (!duplicate) {
    const { error: recordError } = await admin.rpc("record_order_payment", {
      p_order_id: orderId,
      p_amount: amount,
      p_payment_method: provider,
      p_transaction_id: transactionId,
      p_user_id: order.user_id || null,
      p_company_id: companyId,
      p_client_id: order.client_id || null,
      p_currency: input.currency || order.currency || "ZAR",
      p_payment_type: paymentType,
      p_gateway_provider: provider,
    });
    if (recordError) throw new TenantGatewaySettlementError("Failed to record order payment", 500);
  }

  // These fields drive the deposit/balance UI separately from the ledger.
  // Repair them on duplicate webhook delivery too, so an interrupted write
  // after the atomic ledger RPC cannot leave the order stuck unpaid.
  const now = new Date().toISOString();
  const orderPatch = paymentType === "deposit"
    ? {
        deposit_paid: true,
        deposit_paid_at: order.deposit_paid_at || now,
        deposit_transaction_id: transactionId,
        ...(order.confirmed_at ? {} : { confirmed_at: now }),
        ...(String(order.status || "").toLowerCase() === "pending" ? { status: "confirmed" } : {}),
        updated_at: now,
      }
    : {
        balance_paid: true,
        balance_paid_at: order.balance_paid_at || now,
        balance_transaction_id: transactionId,
        updated_at: now,
      };
  const { error: orderPatchError } = await admin.from("orders").update(orderPatch).eq("id", orderId);
  if (orderPatchError) throw new TenantGatewaySettlementError("Could not update order payment status", 500);

  if (invoice?.id) {
    await reconcileInvoiceForOrderPayment(admin, {
      orderId,
      invoiceId: invoice.id,
      amount,
      gatewayTransactionId: transactionId,
    });
  }
  return { order, duplicate };
}

async function findGatewayPayment(admin: any, transactionId: string): Promise<any | null> {
  for (const column of ["gateway_transaction_id", "transaction_id"]) {
    const { data, error } = await admin
      .from("payments")
      .select("company_id, order_id, invoice_id, amount, payment_status, gateway_provider")
      .eq(column, transactionId)
      .limit(1);
    if (error) throw new TenantGatewaySettlementError("Could not check for a duplicate payment", 500);
    if (Array.isArray(data) && data.length > 0) return data[0];
  }
  return null;
}

function assertExistingPayment(
  payment: any,
  expected: { companyId: string; orderId: string | null; invoiceId: string | null; amount: number; provider: TenantGatewayProvider },
) {
  const paymentProvider = String(payment.gateway_provider || "").toLowerCase();
  if (
    payment.company_id !== expected.companyId ||
    payment.order_id !== expected.orderId ||
    (expected.orderId
      ? !!payment.invoice_id && payment.invoice_id !== expected.invoiceId
      : payment.invoice_id !== expected.invoiceId) ||
    !["completed", "paid", "succeeded"].includes(String(payment.payment_status || "").toLowerCase()) ||
    Math.abs(Number(payment.amount) - expected.amount) > 0.01 ||
    (paymentProvider && paymentProvider !== expected.provider)
  ) {
    throw new TenantGatewaySettlementError("Gateway transaction is already linked to a different payment", 409);
  }
}
