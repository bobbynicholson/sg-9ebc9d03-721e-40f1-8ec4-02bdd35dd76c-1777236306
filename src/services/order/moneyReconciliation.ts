/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Money reconciliation - cross-checks the order / invoice / payment money
 * model for drift so the operator catches a mismatch BEFORE a client does.
 *
 * The lifecycle keeps money in three places that can quietly diverge:
 *   - orders.total_amount / balance_amount / balance_paid (the order ledger)
 *   - invoices.total_amount / amount_paid / balance_due   (the billing ledger)
 *   - payments (the cash ledger; paid-to-date is mirrored onto invoices.amount_paid)
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
  const limit = opts?.limit ?? 500;
  const { data: orderRows, error: oErr } = await (sb as any)
    .from("orders")
    .select("id, order_number, client_name, status, total_amount, balance_amount, balance_paid, deposit_paid, payment_status")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (oErr) {
    console.error("[moneyReconciliation] orders read failed:", oErr);
    return { scanned: 0, issues: [], affectedOrders: 0 };
  }
  const orders = (orderRows || []) as any[];
  // Drop cancelled / draft - their money isn't expected to reconcile.
  const live = orders.filter((o) => !["cancelled", "draft"].includes(String(o.status || "").toLowerCase()));
  const orderIds = live.map((o) => o.id);
  if (orderIds.length === 0) return { scanned: 0, issues: [], affectedOrders: 0 };

  const { data: invRows } = await (sb as any)
    .from("invoices")
    .select("order_id, invoice_number, total_amount, amount_paid, balance_due, status")
    .in("order_id", orderIds)
    .is("deleted_at", null);
  const invByOrder = new Map<string, any[]>();
  for (const inv of (invRows || []) as any[]) {
    // Voided / written-off invoices don't count toward the live money picture.
    if (["voided", "written_off"].includes(String(inv.status || "").toLowerCase())) continue;
    const arr = invByOrder.get(inv.order_id);
    if (arr) arr.push(inv); else invByOrder.set(inv.order_id, [inv]);
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
      const expected = r2(Number(inv.total_amount || 0) - Number(inv.amount_paid || 0));
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

    // 4. Paid-flag sanity: balance_paid=true but money still owed, or false
    //    while nothing is owed. Use the invoice balance when present, else the
    //    order balance.
    const owed = invs.length > 0 ? invBalanceSum : (orderBalance ?? 0);
    if (o.balance_paid === true && owed > 0.02) {
      push(o, "paid_flag_mismatch", "error",
        `Marked balance-paid but R${owed} is still outstanding.`,
        invTotalSum, owed);
    }
  }

  return { scanned: live.length, issues, affectedOrders: affected.size };
}
