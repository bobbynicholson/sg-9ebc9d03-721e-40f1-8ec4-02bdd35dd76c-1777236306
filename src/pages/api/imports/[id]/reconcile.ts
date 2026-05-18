/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/imports/[id]/reconcile
 *
 * Day 7. Post-commit "did everything land?" report. Sums totals from
 * every row this job inserted, surfaces anomalies (invoices where
 * balance_due is wrong, orders missing client_id, etc.), and returns
 * a single payload the modal's "done" screen renders.
 *
 * Tenant scoping: company_id from session, every aggregate filtered
 * by import_job_id AND company_id (defence in depth).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Owner or admin only" });
    const companyId = (profile as any)?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const jobId = String(req.query.id || "");
    if (!jobId) return res.status(400).json({ error: "Missing job id" });

    const supabase: any = getServiceSupabase();

    // Pull aggregate counts + sums per target table this job touched.
    // Three round trips is enough; we don't need per-row detail
    // here - the modal links out to the contacts / orders / invoices
    // pages for that.
    const [clientsAgg, ordersAgg, invoicesAgg, paymentsAgg, quotesAgg] = await Promise.all([
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("import_job_id", jobId),
      supabase
        .from("orders")
        .select("id, total_amount, client_id")
        .eq("company_id", companyId)
        .eq("import_job_id", jobId)
        .is("deleted_at", null),
      supabase
        .from("invoices")
        .select("id, total_amount, amount_paid, balance_due, status")
        .eq("company_id", companyId)
        .eq("invoice_data->>__import_job_id", jobId), // best-effort even if invoices doesn't carry import_job_id
      supabase
        .from("payments")
        .select("id, amount, invoice_id")
        .eq("company_id", companyId),
      supabase
        .from("quotes")
        .select("id, total_amount, status")
        .eq("company_id", companyId)
        .eq("import_job_id", jobId)
        .is("deleted_at", null),
    ]);

    // Invoices import_job_id isn't a column on the schema today --
    // we link via the invoice_id stamped on import_rows. Pull those
    // rows separately and look the invoices up by id.
    const { data: invoiceRowIds, error: invoiceRowIdsErr } = await supabase
      .from("import_rows")
      .select("target_id")
      .eq("job_id", jobId)
      .eq("target_table", "invoices")
      .in("status", ["inserted", "updated"]);
    if (invoiceRowIdsErr) {
      console.error("[imports/[id]/reconcile] import_rows fetch failed:", invoiceRowIdsErr);
    }
    const invoiceIds: string[] = ((invoiceRowIds || []) as Array<{ target_id: string | null }>)
      .map((r) => r.target_id)
      .filter((id): id is string => !!id);
    let invoices: any[] = [];
    if (invoiceIds.length > 0) {
      const { data, error: error2 } = await supabase
        .from("invoices")
        .select("id, total_amount, amount_paid, balance_due, status")
        .in("id", invoiceIds)
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error2) {
        console.error("[imports/[id]/reconcile] invoices fetch failed:", error2);
      }
      invoices = (data || []) as any[];
    }

    // Same for payments - link via import_rows.target_id since
    // payments doesn't have import_job_id either.
    const { data: paymentRowIds } = await supabase
      .from("import_rows")
      .select("target_id")
      .eq("job_id", jobId)
      .eq("target_table", "payments")
      .in("status", ["inserted", "updated"]);
    const paymentIds: string[] = ((paymentRowIds || []) as Array<{ target_id: string | null }>)
      .map((r) => r.target_id)
      .filter((id): id is string => !!id);
    let payments: any[] = [];
    if (paymentIds.length > 0) {
      const { data } = await supabase
        .from("payments")
        .select("id, amount, invoice_id")
        .in("id", paymentIds)
        .eq("company_id", companyId);
      payments = (data || []) as any[];
    }

    const orders = (ordersAgg.data || []) as Array<{ id: string; total_amount: number | null; client_id: string | null }>;
    const quotes = (quotesAgg.data || []) as Array<{ id: string; total_amount: number | null; status: string | null }>;

    const orderTotal = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const invoiceTotal = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const balanceDueTotal = invoices.reduce((s, i) => s + Number(i.balance_due || 0), 0);
    const quoteTotal = quotes.reduce((s, q) => s + Number(q.total_amount || 0), 0);

    // Anomalies. Each is something the operator should glance at
    // before treating the import as done. Capped so the report stays
    // skimmable - the per-row drill-down is on the contact / order /
    // invoice pages, not here.
    const anomalies: Array<{ kind: string; detail: string; count: number }> = [];

    const ordersWithoutClient = orders.filter((o) => !o.client_id).length;
    if (ordersWithoutClient > 0) {
      anomalies.push({
        kind: "orders_without_client",
        detail: "Orders that landed without a linked client. Check the contacts page for stub entries to merge.",
        count: ordersWithoutClient,
      });
    }

    const unbalancedInvoices = invoices.filter(
      (i) => Math.abs(Number(i.balance_due || 0) - (Number(i.total_amount || 0) - Number(i.amount_paid || 0))) > 0.01,
    ).length;
    if (unbalancedInvoices > 0) {
      anomalies.push({
        kind: "unbalanced_invoices",
        detail: "Invoices where balance_due doesn't match total - paid. Open the invoice and re-save to recalc.",
        count: unbalancedInvoices,
      });
    }

    const paidInvoicesWithBalance = invoices.filter(
      (i) => i.status === "paid" && Number(i.balance_due || 0) > 0.01,
    ).length;
    if (paidInvoicesWithBalance > 0) {
      anomalies.push({
        kind: "paid_with_balance",
        detail: "Invoices marked 'paid' but still have a balance due. Status conflict - review.",
        count: paidInvoicesWithBalance,
      });
    }

    const paymentsWithoutInvoice = payments.filter((p) => !p.invoice_id).length;
    if (paymentsWithoutInvoice > 0) {
      anomalies.push({
        kind: "payments_without_invoice",
        detail: "Payments that landed without an invoice link. Reconciliation against the bank statement is harder for these - consider importing the matching invoices.",
        count: paymentsWithoutInvoice,
      });
    }

    return res.status(200).json({
      ok: true,
      counts: {
        clients: clientsAgg.count ?? 0,
        orders: orders.length,
        invoices: invoices.length,
        payments: payments.length,
        quotes: quotes.length,
      },
      totals: {
        orders_total: orderTotal,
        invoices_total: invoiceTotal,
        payments_received: paymentsTotal,
        outstanding_balance: balanceDueTotal,
        quotes_total: quoteTotal,
      },
      anomalies,
    });
  } catch (e: any) {
    console.error("/api/imports/[id]/reconcile crashed:", e);
    return res.status(500).json({ error: e?.message || "Reconcile failed" });
  }
}
