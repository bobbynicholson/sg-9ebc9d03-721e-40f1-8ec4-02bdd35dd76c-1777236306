/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Money reconciliation - cross-checks the order / invoice / payment money
 * model for drift so the operator catches a mismatch BEFORE a client does.
 *
 * The lifecycle keeps money in three places that can quietly diverge:
 *   - orders.total_amount / balance_amount / balance_paid (the order ledger)
 *   - invoices.total_amount / amount_paid / balance_due   (the billing ledger)
 *   - payments (the cash ledger; paid-to-date is projected onto the order
 *     and invoices)
 *
 * This module finds, per order, where those three disagree. It's pure-read +
 * side-effect-free: it never "fixes" anything, it surfaces. Used by the admin
 * money-health panel + a nightly cron alert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const r2 = (n: any) => Math.round(Number(n || 0) * 100) / 100;
const near = (a: any, b: any, tol = 0.02) => Math.abs(r2(a) - r2(b)) <= tol;

export type MoneyIssueKind =
  | "order_vs_invoice_total"   // order total != sum of its invoice totals
  | "order_vs_invoice_balance" // order outstanding != sum of invoice balances
  | "order_vs_payment_ledger"  // order paid total != settled payment ledger
  | "invoice_internal"         // an invoice's balance_due != total - paid
  | "paid_flag_mismatch"       // balance_paid=true but a balance is still owed (or vice-versa)
  | "overpaid";                // paid more than the invoice total

export interface MoneyIssue {
  orderId: string;
  orderNumber: string | null;
  clientName: string | null;
  status: string | null;
  kind: MoneyIssueKind;
  severity: "warning" | "error";
  detail: string;
  orderTotal: number;
  invoiceTotal: number;
  outstanding: number;
}

export interface ReconciliationResult {
  scanned: number;
  issues: MoneyIssue[];
  /** Orders with >=1 issue. */
  affectedOrders: number;
  /** The scan is deliberately bounded so the admin request remains fast. */
  truncated: boolean;
}

/**
 * Scan a company's orders for money drift. Recent-first, capped so the admin
 * panel + cron stay fast. Orders with no invoice yet are NOT flagged for a
 * total mismatch (the invoice simply hasn't been generated), but their own
 * paid-flag / internal consistency is still checked.
 */
export async function findMoneyInconsistencies(
  sb: SupabaseClient,
  companyId: string,
  opts?: { limit?: number },
): Promise<ReconciliationResult> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 500, 1000));
  const { data: orderRows, error: oErr } = await (sb as any)
    .from("orders")
    .select("id, order_number, client_name, status, total_amount, amount_paid, payment_opening_paid, balance_amount, balance_paid, deposit_paid, payment_status")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    // One extra row tells the UI whether it is safe to say that *all* orders
    // reconciled, without paying for a separate count query.
    .limit(limit + 1);
  if (oErr) {
    throw new Error(`Could not read orders: ${oErr.message || "unknown error"}`);
  }
  const fetchedOrders = (orderRows || []) as any[];
  const truncated = fetchedOrders.length > limit;
  const orders = fetchedOrders.slice(0, limit);
  // Drop cancelled / draft - their money isn't expected to reconcile.
  const live = orders.filter((o) => !["cancelled", "draft"].includes(String(o.status || "").toLowerCase()));
  const orderIds = live.map((o) => o.id);
  if (orderIds.length === 0) return { scanned: 0, issues: [], affectedOrders: 0, truncated };

  const { data: invRows, error: invErr } = await (sb as any)
    .from("invoices")
    .select("id, order_id, invoice_number, total_amount, amount_paid, balance_due, status")
    .in("order_id", orderIds)
    .is("deleted_at", null);
  if (invErr) {
    throw new Error(`Could not read invoices: ${invErr.message || "unknown error"}`);
  }
  const activeInvoices: any[] = [];
  const invByOrder = new Map<string, any[]>();
  for (const inv of (invRows || []) as any[]) {
    // Voided / written-off invoices don't count toward the live money picture.
    if (["voided", "written_off"].includes(String(inv.status || "").toLowerCase())) continue;
    activeInvoices.push(inv);
    const arr = invByOrder.get(inv.order_id);
    if (arr) arr.push(inv); else invByOrder.set(inv.order_id, [inv]);
  }

  // Query the settled cash ledger separately. The amount fields on orders and
  // invoices are projections; comparing them only to each other cannot catch
  // a failed projection after a real payment was recorded.
  const invoiceIds = activeInvoices.map((inv: any) => inv.id).filter(Boolean);
  const [orderPaymentResult, invoicePaymentResult] = await Promise.all([
    (sb as any)
      .from("payments")
      .select("id, order_id, invoice_id, amount, payment_type, payment_status")
      .eq("company_id", companyId)
      .in("order_id", orderIds),
    invoiceIds.length > 0
      ? (sb as any)
        .from("payments")
        .select("id, order_id, invoice_id, amount, payment_type, payment_status")
        .eq("company_id", companyId)
        .in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (orderPaymentResult.error || invoicePaymentResult.error) {
    const error = orderPaymentResult.error || invoicePaymentResult.error;
    throw new Error(`Could not read payments: ${error?.message || "unknown error"}`);
  }
  const invoiceOrderById = new Map<string, string>();
  for (const inv of activeInvoices) {
    if (inv.id && inv.order_id) invoiceOrderById.set(inv.id, inv.order_id);
  }
  const paymentsByOrder = new Map<string, any[]>();
  const paymentIds = new Set<string>();
  for (const payment of [...(orderPaymentResult.data || []), ...(invoicePaymentResult.data || [])] as any[]) {
    // The same payment can link both an order and its invoice. It belongs to
    // one order, and must count once in the ledger comparison.
    if (payment.id && paymentIds.has(payment.id)) continue;
    if (payment.id) paymentIds.add(payment.id);
    if (!["completed", "paid", "succeeded"].includes(String(payment.payment_status || "").toLowerCase())) continue;
    const orderId = payment.order_id || invoiceOrderById.get(payment.invoice_id);
    if (!orderId) continue;
    const arr = paymentsByOrder.get(orderId);
    if (arr) arr.push(payment); else paymentsByOrder.set(orderId, [payment]);
  }

  const issues: MoneyIssue[] = [];
  const affected = new Set<string>();
  const push = (o: any, kind: MoneyIssueKind, severity: "warning" | "error", detail: string, invTotal: number, outstanding: number) => {
    issues.push({
      orderId: o.id,
      orderNumber: o.order_number ?? null,
      clientName: o.client_name ?? null,
      status: o.status ?? null,
      kind,
      severity,
      detail,
      orderTotal: r2(o.total_amount),
      invoiceTotal: r2(invTotal),
      outstanding: r2(outstanding),
    });
    affected.add(o.id);
  };

  for (const o of live) {
    const invs = invByOrder.get(o.id) || [];
    const orderTotal = r2(o.total_amount);
    const orderBalance = o.balance_amount != null ? r2(o.balance_amount) : null;
    const invTotalSum = r2(invs.reduce((s, i) => s + Number(i.total_amount || 0), 0));
    const invBalanceSum = r2(invs.reduce((s, i) => s + Number(i.balance_due || 0), 0));

    // 1. Each invoice internally consistent: balance_due == total - paid.
    for (const inv of invs) {
      // balance_due is never negative. An overpayment is surfaced below as a
      // warning, not falsely reported as a broken invoice calculation too.
      const expected = r2(Math.max(0, Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)));
      if (!near(inv.balance_due, expected)) {
        push(o, "invoice_internal", "error",
          `Invoice ${inv.invoice_number}: balance R${r2(inv.balance_due)} but total - paid = R${expected}.`,
          invTotalSum, invBalanceSum);
      }
      // overpaid
      if (Number(inv.amount_paid || 0) - Number(inv.total_amount || 0) > 0.02) {
        push(o, "overpaid", "warning",
          `Invoice ${inv.invoice_number}: paid R${r2(inv.amount_paid)} exceeds total R${r2(inv.total_amount)}.`,
          invTotalSum, invBalanceSum);
      }
    }

    // 2. Order total vs invoice total (only when an invoice exists).
    if (invs.length > 0 && !near(orderTotal, invTotalSum)) {
      push(o, "order_vs_invoice_total", "error",
        `Order total R${orderTotal} != invoice total R${invTotalSum} (diff R${r2(orderTotal - invTotalSum)}).`,
        invTotalSum, invBalanceSum);
    }

    // 3. Order outstanding vs invoice balance (only when an invoice exists).
    if (invs.length > 0 && orderBalance != null && !near(orderBalance, invBalanceSum)) {
      push(o, "order_vs_invoice_balance", "error",
        `Order outstanding R${orderBalance} != invoice balance R${invBalanceSum}.`,
        invTotalSum, invBalanceSum);
    }

    // 4. Order paid projection vs the actual settled ledger. Imported money
    // predating payment rows lives in payment_opening_paid, so include it just
    // as the database reconciliation function does.
    const ledgerPaid = r2(Math.max(0,
      Number(o.payment_opening_paid || 0) + (paymentsByOrder.get(o.id) || []).reduce((sum, payment) => {
        const amount = Math.abs(Number(payment.amount || 0));
        if (String(payment.payment_type || "").toLowerCase() === "refund") return sum - amount;
        if (String(payment.payment_type || "").toLowerCase() === "credit_issue") return sum;
        return sum + Number(payment.amount || 0);
      }, 0),
    ));
    const projectedPaid = r2(o.amount_paid);
    if (!near(projectedPaid, ledgerPaid)) {
      push(o, "order_vs_payment_ledger", "error",
        `Order paid R${projectedPaid} != settled payment ledger R${ledgerPaid}.`,
        invTotalSum, orderBalance ?? invBalanceSum);
    }

    // 5. Paid-flag sanity: balance_paid=true but money still owed, or false
    //    while nothing is owed. Use the invoice balance when present, else the
    //    order balance.
    const owed = invs.length > 0 ? invBalanceSum : (orderBalance ?? 0);
    const shouldBePaid = orderTotal > 0.02 && owed <= 0.02;
    if (o.balance_paid === true && !shouldBePaid) {
      push(o, "paid_flag_mismatch", "error", `Marked balance-paid but R${owed} is still outstanding.`, invTotalSum, owed);
    } else if (o.balance_paid === false && shouldBePaid) {
      push(o, "paid_flag_mismatch", "error", "Balance is settled but the order is not marked balance-paid.", invTotalSum, owed);
    }
  }

  return { scanned: live.length, issues, affectedOrders: affected.size, truncated };
}
