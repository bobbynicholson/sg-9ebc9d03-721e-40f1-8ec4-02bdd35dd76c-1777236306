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
    // Atomic RPC: payment INSERT + orders.payment_status recompute happen
    // in one transaction. Previously this was two sequential round-trips
    // (insert into payments, then updateOrderPaymentStatus) and a failure
    // between them left the order showing the wrong payment status while
    // the payments row was real. The RPC also short-circuits if a row
    // with the same gateway_transaction_id already exists [P0-10].
    // Cast to any: record_order_payment was added in
    // 20260507130000_atomic_record_order_payment.sql; database.types.ts
    // hasn't been regenerated yet, so the strongly-typed rpc() overload
    // doesn't know the function name. Type generation will catch up in
    // the next supabase gen run.
    const { data: paymentId, error } = await (supabase as any).rpc(
      "record_order_payment",
      {
        p_order_id: orderId,
        p_amount: amount,
        p_payment_method: paymentMethod,
        p_transaction_id: transactionId ?? null,
        p_user_id: extra.userId ?? null,
        p_company_id: extra.companyId ?? null,
        p_client_id: extra.clientId ?? null,
        p_currency: extra.currency ?? null,
        p_payment_type: extra.paymentType ?? null,
        p_gateway_provider: extra.gatewayProvider ?? null,
      }
    );

    if (error) throw error;

    // Hydrate the inserted row for callers that expect the payment shape.
    if (paymentId) {
      const { data: row } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId as unknown as string)
        .maybeSingle();
      return { success: true, data: row };
    }

    return { success: true, data: null };
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

    // Reads payment_status (canonical enum). Phase 4B dropped the legacy text column.
    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("order_id", orderId)
      .eq("payment_status", "completed" as any);

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