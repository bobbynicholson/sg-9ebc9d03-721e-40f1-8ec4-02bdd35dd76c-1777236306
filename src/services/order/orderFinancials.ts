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
 * pricingMode honours the tenant's `companies.pricing_includes_vat`:
 *  - "ex" (default for back-compat): line totals are net, VAT added on top.
 *  - "inc": line totals are gross; subtotal is derived by dividing back.
 * Both modes return { subtotal: ex-VAT, tax, total: gross } so downstream
 * code (invoices, accounting export) can rely on a consistent shape.
 *
 * The 0.15 default is a safety fallback ONLY for ad-hoc test harnesses
 * and one-off scripts; production paths must always provide an explicit
 * tenant-aware rate.
 */
export async function calculateOrderTotal(
  orderItems: any[],
  taxRate: number = 0.15,
  pricingMode: "inc" | "ex" = "ex",
) {
  const lineSum = orderItems.reduce((sum, item) => {
    return sum + (item.unit_price * item.quantity);
  }, 0);

  const safeTaxRate = typeof taxRate === "number" && taxRate >= 0 && taxRate <= 1 ? taxRate : 0.15;

  let subtotal: number;
  let tax: number;
  let total: number;
  if (pricingMode === "inc") {
    total = Number(lineSum.toFixed(2));
    subtotal = Number((total / (1 + safeTaxRate)).toFixed(2));
    tax = Number((total - subtotal).toFixed(2));
  } else {
    subtotal = Number(lineSum.toFixed(2));
    tax = Number((subtotal * safeTaxRate).toFixed(2));
    total = Number((subtotal + tax).toFixed(2));
  }

  return { subtotal, tax, total };
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

/**
 * Audit (May 2026, Wave 5): the previous implementation here was a
 * footgun -- it wrote an invoice row without company_id (breaking
 * RLS scoping) and synthesised invoice_number from
 * `INV-YYYY-<4-digit random>`, with a ~0.5 collision probability
 * after ~80 invoices per year per tenant. The canonical path is
 * ensureInvoiceForOrder (invoiceGenerationService) which uses
 * tenant-scoped sequence numbers + the full invoice payload
 * (subtotal, VAT, line items). Delegating here so any straggling
 * caller (none in current code) lands on the safe path.
 */
export async function generateInvoice(orderId: string) {
  try {
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, company_id")
      .eq("id", orderId)
      .maybeSingle();
    if (error || !order) {
      return { success: false, error: error?.message || "Order not found" };
    }
    const { ensureInvoiceForOrder } = await import("@/services/invoiceGenerationService");
    const res = await ensureInvoiceForOrder(
      orderId,
      (order as any).company_id,
      supabase as any,
      {},
    );
    if (!res.success) {
      return { success: false, error: (res as any).error || "Invoice generation failed" };
    }
    return { success: true, invoice: { id: (res as any).invoiceId } };
  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return { success: false, error: error.message };
  }
}