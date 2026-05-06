import { supabase } from "@/integrations/supabase/client";

/**
 * Order Financial Operations
 * Handles payments, invoices, and financial calculations
 */

/**
 * Sum a list of order items and apply VAT.
 *
 * IMPORTANT: callers MUST pass the effective taxRate as a decimal
 * (0.15 = 15%) -- typically resolved via
 * `branchSettingsService.resolveBranchSettings(companyId, regionId).vatRate`.
 *
 * The 0.15 default is a safety fallback ONLY for ad-hoc test harnesses
 * and one-off scripts; production paths must always provide an explicit
 * tenant-aware rate. Audit (Agent 5) flagged that the previous
 * hard-coded 0.15 ignored per-tenant + per-branch overrides; this
 * signature change forces the call site to think about it.
 */
export async function calculateOrderTotal(orderItems: any[], taxRate: number = 0.15) {
  const subtotal = orderItems.reduce((sum, item) => {
    return sum + (item.unit_price * item.quantity);
  }, 0);

  const safeTaxRate = typeof taxRate === "number" && taxRate >= 0 && taxRate <= 1 ? taxRate : 0.15;
  const tax = subtotal * safeTaxRate;
  const total = subtotal + tax;

  return {
    subtotal,
    tax,
    total,
  };
}

export interface RecordPaymentExtra {
  userId?: string;
  companyId?: string;
  clientId?: string;
  currency?: string;
  paymentType?: "deposit" | "balance" | "invoice" | "refund" | string;
  gatewayProvider?: string;
}

export async function recordPayment(
  orderId: string,
  amount: number,
  paymentMethod: string,
  transactionId?: string,
  extra: RecordPaymentExtra = {}
) {
  try {
    const nowIso = new Date().toISOString();

    // Two columns until Phase 2 consolidation: `payment_status` is the
    // canonical enum (matches verify-claim, EFT and refund flows);
    // `status` is a legacy text mirror still read by older webhooks and
    // the order-finance summaries. Mirror status = payment_status::text
    // so both sides agree until the column is dropped.
    const insertRow: Record<string, any> = {
      order_id: orderId,
      amount,
      payment_method: paymentMethod,
      gateway_transaction_id: transactionId,
      transaction_id: transactionId,
      payment_status: "completed",
      status: "completed",
      processed_at: nowIso,
      completed_at: nowIso,
      created_at: nowIso,
    };

    if (extra.userId) insertRow.user_id = extra.userId;
    if (extra.companyId) insertRow.company_id = extra.companyId;
    if (extra.clientId) insertRow.client_id = extra.clientId;
    if (extra.currency) insertRow.currency = extra.currency;
    if (extra.paymentType) insertRow.payment_type = extra.paymentType;
    if (extra.gatewayProvider) {
      insertRow.gateway = extra.gatewayProvider;
      insertRow.gateway_provider = extra.gatewayProvider;
      insertRow.payment_reference = transactionId;
    }

    const { data, error } = await supabase
      .from("payments")
      .insert(insertRow as any)
      .select()
      .single();

    if (error) throw error;

    // Update order payment status
    await updateOrderPaymentStatus(orderId);

    return { success: true, data };
  } catch (error: any) {
    console.error("Error recording payment:", error);
    return { success: false, error: error.message };
  }
}

export async function updateOrderPaymentStatus(orderId: string) {
  try {
    // Get order total and payments
    const { data: order } = await supabase
      .from("orders")
      .select("total_amount, deposit_amount")
      .eq("id", orderId)
      .single();

    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("order_id", orderId)
      .eq("status", "completed" as any);

    const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const totalAmount = order?.total_amount || 0;

    let paymentStatus: any = "unpaid";
    if (totalPaid >= totalAmount) {
      paymentStatus = "paid";
    } else if (totalPaid > 0) {
      paymentStatus = "partial";
    }

    await supabase
      .from("orders")
      .update({ payment_status: paymentStatus })
      .eq("id", orderId);

    return { success: true, paymentStatus };
  } catch (error: any) {
    console.error("Error updating payment status:", error);
    return { success: false, error: error.message };
  }
}

export async function getOrderPayments(orderId: string) {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .order("payment_date", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error("Error fetching order payments:", error);
    return [];
  }
}

export async function generateInvoice(orderId: string) {
  try {
    // Get order with all details
    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(*),
        order_items(*),
        company:companies(*)
      `)
      .eq("id", orderId)
      .single();

    if (error) throw error;

    // Generate invoice number
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Create invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        order_id: orderId,
        client_id: order.client_id,
        invoice_number: invoiceNumber,
        issue_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        balance_due: order.total_amount - (order.amount_paid || 0),
        status: "sent" as any,
      } as any)
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    return { success: true, invoice };
  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return { success: false, error: error.message };
  }
}