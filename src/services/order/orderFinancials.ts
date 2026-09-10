import { supabase } from "@/integrations/supabase/client";
import {
  deriveOrderPaymentStatus,
  setOrderPaymentStatus,
} from "@/services/order/orderPaymentStatus";

/**
 * Order Financial Operations
 * Handles payments, invoices, and financial calculations
 */

/**
 * Sum a list of order items and apply VAT.
 *
 * IMPORTANT: callers MUST pass the effective taxRate as a decimal
 * (0.15 = 15%) - typically resolved via
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

/**
 * Recompute orders.payment_status from the payments ledger.
 *
 * Phase 2 audit (docs/money-flow.md): this used to write the literal
 * "unpaid" which is not a member of the `payment_status` enum, so the
 * write silently failed and the order's payment_status would stay
 * stuck. Now derives the canonical value via deriveOrderPaymentStatus
 * (returns pending | partial | paid) and routes the write through the
 * single setOrderPaymentStatus gate so the transition allowlist
 * applies (e.g. you can't downgrade a refunded order back to pending
 * just because a payment row was deleted).
 *
 * Returns the derived status even if the write was blocked by the
 * allowlist - the caller can decide whether to escalate.
 */
export async function updateOrderPaymentStatus(orderId: string) {
  try {
    const { data: order } = await supabase
      .from("orders")
      .select("total_amount, deposit_amount")
      .eq("id", orderId)
      .single();

    // Sum only successfully-completed payment rows. partial / pending
    // / processing / failed are ignored - they're not committed money.
    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("order_id", orderId)
      .eq("payment_status", "completed" as any);

    const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
    const totalAmount = Number(order?.total_amount || 0);
    const paymentStatus = deriveOrderPaymentStatus(totalPaid, totalAmount);

    const res = await setOrderPaymentStatus(orderId, paymentStatus, {
      client: supabase,
      reason: `recomputed from payments ledger (paid ${totalPaid.toFixed(2)} of ${totalAmount.toFixed(2)})`,
    });

    // success=false from setOrderPaymentStatus means the transition
    // was blocked by the allowlist (e.g. trying to demote a refunded
    // order). Surface that as a non-error - the underlying payment
    // ledger is still correct, only the projection refused.
    if (!res.success) {
      console.warn(
        "[updateOrderPaymentStatus] derived status blocked by allowlist:",
        res.error,
      );
    }
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
 * footgun - it wrote an invoice row without company_id (breaking
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

/**
 * Wave 49 B8 - final invoice reconciliation on event close.
 *
 * Audit (Specialist 1) found that damages reported via
 * driverConfirmationService.completeCollection landed in the
 * equipment_damages table - but no path ever turned them into a
 * top-up invoice for the client. Cost of damaged kit walked out the
 * door silently. Same gap for any post-event balance correction
 * (extra hours, tip pass-through, missing return).
 *
 * Strategy:
 *  - sum unresolved equipment_damages.repair_cost for this order
 *  - if total > 0, add a single line item to the existing balance
 *    invoice (or create one) describing the adjustment
 *  - mark each consumed damage row as 'resolved' so a re-run is
 *    a cheap no-op
 *
 * Idempotent: looks for an existing 'damage_recovery' line item on
 * the invoice and updates it instead of duplicating. Returns the
 * total recovered + per-damage breakdown so the caller (the
 * auto-complete cron) can log the receipt.
 *
 * Best-effort: any sub-failure logs and returns success=false; the
 * caller decides whether to block the order's status flip on it.
 */
export async function reconcileOnComplete(orderId: string): Promise<{
  success: boolean;
  totalRecovered: number;
  damageCount: number;
  error?: string;
}> {
  try {
    // Pull all unresolved damages for this order.
    const { data: damages, error: dmgErr } = await (supabase as any)
      .from("equipment_damages")
      .select("id, repair_cost, damage_type, notes")
      .eq("order_id", orderId)
      .eq("resolved", false);
    if (dmgErr) {
      console.error("[reconcileOnComplete] damages fetch failed:", dmgErr);
      return { success: false, totalRecovered: 0, damageCount: 0, error: dmgErr.message };
    }
    const rows = (damages || []) as Array<{ id: string; repair_cost: number | null; damage_type: string; notes: string | null }>;
    const totalRecovered = rows.reduce((s, r) => s + Number(r.repair_cost || 0), 0);
    if (totalRecovered <= 0 || rows.length === 0) {
      return { success: true, totalRecovered: 0, damageCount: 0 };
    }

    // Need company_id for the invoice path.
    const { data: order } = await supabase
      .from("orders")
      .select("id, company_id, order_number")
      .eq("id", orderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!order || !(order as any).company_id) {
      return { success: false, totalRecovered, damageCount: rows.length, error: "order_or_company_missing" };
    }
    const companyId = (order as any).company_id;
    const orderNumber = (order as any).order_number || orderId;

    // Lazy import to avoid circular dep with invoiceGenerationService.
    const { ensureInvoiceForOrder } = await import("@/services/invoiceGenerationService");
    const inv = await ensureInvoiceForOrder(orderId, companyId, supabase as any, {});
    if (!inv.success || !(inv as any).invoiceId) {
      return { success: false, totalRecovered, damageCount: rows.length, error: "invoice_unavailable" };
    }
    const invoiceId = (inv as any).invoiceId as string;

    // Invoices are flat (subtotal + tax_amount + total_amount). Line
    // items live as JSONB on invoice_data.line_items so this single
    // table holds both the headline numbers and the audit detail.
    // We append a damage_recovery line if one isn't already there;
    // existing rows get updated in-place so re-runs don't duplicate.
    const { data: invRow, error: invFetchErr } = await (supabase as any)
      .from("invoices")
      .select("id, subtotal, tax_amount, total_amount, balance_due, invoice_data")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invFetchErr || !invRow) {
      return { success: false, totalRecovered, damageCount: rows.length, error: "invoice_fetch_failed" };
    }

    const invoiceData = (invRow as any).invoice_data || {};
    const lineItems: Array<any> = Array.isArray(invoiceData.line_items)
      ? [...invoiceData.line_items]
      : [];
    const description = `Damage recovery for ${orderNumber} - ${rows.length} item${rows.length === 1 ? "" : "s"}`;
    const damageLine = {
      type: "damage_recovery",
      description,
      quantity: 1,
      unit_price: totalRecovered,
      line_total: totalRecovered,
      damage_ids: rows.map((r) => r.id),
      added_at: new Date().toISOString(),
    };

    // Idempotent: replace any prior damage_recovery line, otherwise
    // append. Allows the cron to retry safely after a partial failure.
    const existingIdx = lineItems.findIndex((l) => l?.type === "damage_recovery");
    const priorAmount = existingIdx >= 0 ? Number(lineItems[existingIdx]?.line_total || 0) : 0;
    if (existingIdx >= 0) {
      lineItems[existingIdx] = damageLine;
    } else {
      lineItems.push(damageLine);
    }
    invoiceData.line_items = lineItems;

    // Recompute totals: subtract the prior recovery (if any) before
    // adding the fresh figure so the headline numbers stay sane on
    // re-runs.
    const oldSubtotal = Number((invRow as any).subtotal || 0);
    const oldTax = Number((invRow as any).tax_amount || 0);
    const newSubtotal = Number((oldSubtotal - priorAmount + totalRecovered).toFixed(2));
    // Damage recovery is taxable at the company rate; lookup once.
    const { data: companyRow } = await (supabase as any)
      .from("companies")
      .select("vat_rate, pricing_includes_vat")
      .eq("id", companyId)
      .maybeSingle();
    const vatRate = Number((companyRow as any)?.vat_rate ?? 0.15);
    const taxOnRecovery = Number(((totalRecovered - priorAmount) * vatRate).toFixed(2));
    const newTax = Number((oldTax + taxOnRecovery).toFixed(2));
    const newTotal = Number((newSubtotal + newTax).toFixed(2));
    const oldBalance = Number((invRow as any).balance_due || 0);
    const newBalance = Number((oldBalance + (totalRecovered - priorAmount) + taxOnRecovery).toFixed(2));

    const { error: invUpdErr } = await (supabase as any)
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        tax_amount: newTax,
        total_amount: newTotal,
        balance_due: newBalance,
        invoice_data: invoiceData,
      })
      .eq("id", invoiceId);
    if (invUpdErr) {
      return { success: false, totalRecovered, damageCount: rows.length, error: invUpdErr.message };
    }

    // Mark damages as resolved so re-runs do not double-charge.
    const ids = rows.map((r) => r.id);
    const { error: resolveErr } = await (supabase as any)
      .from("equipment_damages")
      .update({ resolved: true })
      .in("id", ids);
    if (resolveErr) {
      console.warn("[reconcileOnComplete] damages resolve failed (non-blocking):", resolveErr);
    }

    return { success: true, totalRecovered, damageCount: rows.length };
  } catch (e: any) {
    console.error("[reconcileOnComplete] crashed:", e);
    return { success: false, totalRecovered: 0, damageCount: 0, error: e?.message || "crash" };
  }
}