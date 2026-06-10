/**
 * POST /api/admin/invoices/bulk-mark-paid
 *
 * Flow audit Leg C P0-1: the operator's bulk mark-paid action in
 * /admin/invoices used to write straight to `invoices` - it set
 * status='paid' and amount_paid=total_amount, but never inserted a
 * row in `payments`, never updated `orders.payment_status`, and
 * never closed the source order. Net effect: the finance dashboard
 * either double-counted (if the operator later recorded a payment
 * manually) or under-counted (if the order was still showing
 * unpaid). This endpoint replaces the naked update with the canonical
 * `record_invoice_payment` RPC - same path the PayFast webhook uses,
 * so the payments ledger, orders.payment_status, orders.amount_paid,
 * and invoices.status all land in sync inside a single transaction
 * per invoice.
 *
 * Auth: signed-in admin/owner on the tenant. Each invoice id is
 * filtered to company_id == caller's company_id before we touch it,
 * so a compromised client can't bulk-pay another tenant's invoices.
 *
 * Body: { invoiceIds: string[] }
 * Returns: { ok, paid, skipped, failed, errors }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner", "sales_admin", "region_admin"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[admin/invoices/bulk-mark-paid] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    const raw = (req.body || {}).invoiceIds;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: "invoiceIds required" });
    }
    const invoiceIds = raw.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
    if (invoiceIds.length === 0) {
      return res.status(400).json({ error: "No valid invoice ids" });
    }

    // Tenant-scoped read. RLS would already block cross-tenant writes,
    // but we double-check here so we can tell the operator *why* a
    // given id was skipped instead of swallowing it inside the RPC.
    // Pull order_id + linked order.status so we can refuse to settle
    // invoices attached to cancelled orders (real-world: the invoice
    // becomes voided by the cancellation cascade, but a stale tab
    // can still try to mark it paid which used to surface as a
    // confusing generic RPC error).
    const { data: rows, error: readErr } = await ssr
      .from("invoices")
      .select("id, company_id, client_id, total_amount, balance_due, status, currency, order_id, order:orders!invoices_order_id_fkey(status)")
      .eq("company_id", companyId)
      .in("id", invoiceIds);
    if (readErr) {
      console.error("[bulk-mark-paid] read failed:", readErr);
      return res.status(500).json({ error: readErr.message });
    }

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Resolve a default currency from the company row when an invoice
    // row doesn't carry one. The RPC defaults to ZAR but the payment
    // ledger is easier to audit when the actual tenant currency lands
    // on every row.
    let companyCurrency = "ZAR";
    try {
      const { data: companyRow, error: companyRowErr } = await ssr
        .from("companies")
        .select("currency")
        .eq("id", companyId)
        .maybeSingle();
      if (companyRowErr) {
        console.error("[admin/invoices/bulk-mark-paid] companies fetch failed:", companyRowErr);
      }
      if ((companyRow as any)?.currency) companyCurrency = (companyRow as any).currency;
    } catch {
      // non-fatal - fall back to ZAR
    }

    let paid = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ invoiceId: string; reason: string }> = [];

    const byId = new Map<string, any>();
    for (const r of (rows || []) as any[]) byId.set(r.id, r);

    for (const id of invoiceIds) {
      const inv = byId.get(id);
      if (!inv) {
        skipped += 1;
        errors.push({ invoiceId: id, reason: "Not found in your company" });
        continue;
      }
      if (inv.status === "paid") {
        skipped += 1;
        continue;
      }
      // Voided / written-off invoices are terminal - the payment
      // ledger should never gain rows against them. The cancellation
      // cascade voids the invoice + zeroes the balance when the linked
      // order is cancelled. If a stale browser tab still has the
      // pre-cancel invoice selected, surface why instead of letting
      // the RPC fire and produce a misleading "Marked as paid" toast.
      if (inv.status === "voided" || inv.status === "written_off") {
        skipped += 1;
        errors.push({
          invoiceId: id,
          reason: `Invoice is ${inv.status} - the linked order was cancelled or the invoice was written off. Refresh the page to see the latest state.`,
        });
        continue;
      }
      // Block mark-paid on invoices attached to cancelled orders. The
      // cascade should have voided the invoice already, but if it
      // didn't (e.g. legacy data) we refuse here so the operator
      // doesn't add ledger entries against a dead order.
      const linkedOrderStatus = (inv.order as { status?: string } | { status?: string }[] | null);
      const orderStatus = Array.isArray(linkedOrderStatus)
        ? linkedOrderStatus[0]?.status
        : linkedOrderStatus?.status;
      if (orderStatus === "cancelled") {
        skipped += 1;
        errors.push({
          invoiceId: id,
          reason: "Linked order is cancelled. Restore the order first or write the invoice off.",
        });
        continue;
      }
      // Settle the outstanding balance, not the full total. If a
      // partial payment already exists, paying total_amount on top
      // would record a double-charge in the ledger.
      const amount = Number(inv.balance_due ?? inv.total_amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        skipped += 1;
        errors.push({ invoiceId: id, reason: "Zero or invalid balance - nothing to settle" });
        continue;
      }
      const currency = (inv.currency as string) || companyCurrency;
      // Stable transaction id per invoice + operator so the RPC's
      // belt-and-braces idempotency block kicks in on a double-click.
      const txnId = `manual-${id}`;
      try {
        const { error: rpcErr } = await admin.rpc("record_invoice_payment", {
          p_invoice_id: id,
          p_amount: amount,
          p_payment_method: "manual",
          p_transaction_id: txnId,
          p_company_id: companyId,
          p_client_id: inv.client_id ?? null,
          p_currency: currency,
          p_gateway_provider: "manual",
        });
        if (rpcErr) {
          failed += 1;
          errors.push({ invoiceId: id, reason: rpcErr.message });
          continue;
        }
        paid += 1;
      } catch (e: any) {
        failed += 1;
        errors.push({ invoiceId: id, reason: e?.message || "RPC crashed" });
      }
    }

    // One batch audit row - matches the bulk-remind convention so
    // audit_logs stays readable when an operator settles 50 EFTs at once.
    try {
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "invoice_bulk_mark_paid",
        entity_type: "company",
        entity_id: companyId,
        details: {
          requested: invoiceIds.length,
          paid,
          skipped,
          failed,
          errors: errors.slice(0, 20),
        },
      });
    } catch (auditErr) {
      console.warn("[bulk-mark-paid] audit insert failed:", auditErr);
    }

    return res.status(200).json({ ok: true, paid, skipped, failed, errors });
  } catch (err: any) {
    console.error("[bulk-mark-paid] crashed:", err);
    return res.status(500).json({ error: err?.message || "Bulk mark-paid failed" });
  }
}

export default withApiLogging(handler);
