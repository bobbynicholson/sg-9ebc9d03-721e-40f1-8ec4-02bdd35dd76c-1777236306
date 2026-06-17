/**
 * POST /api/admin/invoices/[id]/mark-paid
 *
 * Wave 66.5 - single-invoice manual-payment recording with operator
 * metadata. The companion to bulk-mark-paid: same canonical RPC
 * (record_invoice_payment) so the payments ledger + orders.payment_status
 * + invoices.status all stay coherent, but accepts per-row metadata
 * (amount, payment method, reference, internal note) so the operator's
 * MarkPaidDialog can record a real payment instead of a placeholder.
 *
 * Bulk-mark-paid stayed untouched - it has zero per-row metadata and
 * is wired to the checkbox toolbar; this endpoint is wired to the
 * per-row "$ Mark paid" button + dialog.
 *
 * Auth: signed-in admin/owner/sales_admin/region_admin on the tenant.
 * The invoice is filtered to company_id == caller's company_id before
 * we touch it, so a compromised account can't pay another tenant's
 * invoices.
 *
 * Body:
 *   {
 *     amount?: number,           // defaults to balance_due
 *     paymentMethod?: string,    // 'bank_transfer' | 'cash' | 'eft' | 'card' | 'manual'
 *     reference?: string,        // free text shown to bookkeeping; doubles as transaction_id for idempotency
 *     note?: string,             // optional, written to audit_logs.details.note
 *   }
 * Returns: { ok, paymentId?, amountPaid, balanceDue, invoiceStatus }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { notifyInvoicePaid } from "@/services/payments/notifyInvoicePaid";


const ALLOWED_ROLES = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
  "sales_admin",
  "region_admin",
]);

const ALLOWED_METHODS = new Set([
  "bank_transfer",
  "cash",
  "eft",
  "card",
  "cheque",
  "manual",
]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const invoiceId = typeof req.query.id === "string" ? req.query.id : null;
    if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
      return res.status(400).json({ error: "Valid invoice id required" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[admin/invoices/mark-paid] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    const body = (req.body || {}) as Record<string, unknown>;
    const rawAmount = body.amount;
    const rawMethod = body.paymentMethod;
    const rawReference = body.reference;
    const rawNote = body.note;

    const paymentMethod = (typeof rawMethod === "string" && ALLOWED_METHODS.has(rawMethod))
      ? rawMethod
      : "manual";
    const reference = typeof rawReference === "string" && rawReference.trim().length > 0
      ? rawReference.trim().slice(0, 120)
      : null;
    const note = typeof rawNote === "string" && rawNote.trim().length > 0
      ? rawNote.trim().slice(0, 500)
      : null;

    // Tenant-scoped read so we can surface a useful error if the id
    // is wrong or belongs to another company. RLS would already block
    // a cross-tenant write, but we double-check here for the message.
    const { data: invoice, error: readErr } = await ssr
      .from("invoices")
      .select("id, company_id, client_id, total_amount, balance_due, status, currency, invoice_number, order_id")
      .eq("company_id", companyId)
      .eq("id", invoiceId)
      .maybeSingle();
    if (readErr) {
      console.error("[admin/invoices/mark-paid] read failed:", readErr);
      return res.status(500).json({ error: readErr.message });
    }
    if (!invoice) return res.status(404).json({ error: "Invoice not found in your company" });
    if ((invoice as any).status === "paid") {
      return res.status(409).json({ error: "Invoice is already fully paid" });
    }

    const defaultAmount = Number((invoice as any).balance_due ?? (invoice as any).total_amount ?? 0);
    const amount = typeof rawAmount === "number" && Number.isFinite(rawAmount) && rawAmount > 0
      ? Number(rawAmount.toFixed(2))
      : defaultAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be greater than zero" });
    }
    if (amount > defaultAmount + 0.01) {
      // Allow exact match but reject overpayment so the operator gets a
      // clear toast instead of a silent credit-balance creation.
      return res.status(400).json({
        error: `Amount R ${amount.toFixed(2)} exceeds outstanding balance R ${defaultAmount.toFixed(2)}`,
      });
    }

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Resolve currency from invoice -> fall back to company default.
    let currency = ((invoice as any).currency as string) || "ZAR";
    if (!(invoice as any).currency) {
      try {
        const { data: companyRow } = await ssr
          .from("companies")
          .select("currency")
          .eq("id", companyId)
          .maybeSingle();
        if ((companyRow as any)?.currency) currency = (companyRow as any).currency;
      } catch {
        // non-fatal
      }
    }

    // transaction_id doubles as the RPC's idempotency key. Use the
    // operator's reference when provided; otherwise stamp a manual key
    // that includes the user id + epoch so a double-click within a
    // second collapses to one ledger row.
    const transactionId = reference || `manual-${user.id.slice(0, 8)}-${Date.now()}`;

    const { error: rpcErr } = await admin.rpc("record_invoice_payment", {
      p_invoice_id: invoiceId,
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_transaction_id: transactionId,
      p_company_id: companyId,
      p_client_id: (invoice as any).client_id ?? null,
      p_currency: currency,
      p_gateway_provider: paymentMethod === "card" ? "manual_card" : "manual",
    });
    if (rpcErr) {
      console.error("[admin/invoices/mark-paid] RPC failed:", rpcErr);
      return res.status(500).json({ error: rpcErr.message });
    }

    // Read back the updated invoice so the client can refresh state
    // optimistically without re-fetching the whole list.
    const { data: updated } = await admin
      .from("invoices")
      .select("id, status, amount_paid, balance_due")
      .eq("id", invoiceId)
      .maybeSingle();

    // Audit row - single source of truth for the manual mark-paid
    // trail. The RPC already writes the payments row; this captures
    // the operator's note + reference for future reconciliation.
    try {
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "invoice_mark_paid_single",
        entity_type: "invoice",
        entity_id: invoiceId,
        details: {
          invoice_number: (invoice as any).invoice_number,
          amount,
          currency,
          payment_method: paymentMethod,
          reference,
          note,
        },
      });
    } catch (auditErr) {
      console.warn("[admin/invoices/mark-paid] audit insert failed:", auditErr);
    }

    // Payment-received notifications (owner + client), best-effort.
    await notifyInvoicePaid({
      admin,
      companyId,
      orderId: (invoice as any).order_id ?? null,
      invoiceNumber: (invoice as any).invoice_number ?? null,
      clientId: (invoice as any).client_id ?? null,
      amount,
      currency,
      fullyPaid: ((updated as any)?.status ?? "") === "paid",
    }).catch((e) => console.warn("[admin/invoices/mark-paid] notifyInvoicePaid failed:", e));

    return res.status(200).json({
      ok: true,
      amountPaid: (updated as any)?.amount_paid ?? amount,
      balanceDue: (updated as any)?.balance_due ?? 0,
      invoiceStatus: (updated as any)?.status ?? "paid",
    });
  } catch (err: any) {
    console.error("[admin/invoices/mark-paid] crashed:", err);
    return res.status(500).json({ error: err?.message || "Mark-paid failed" });
  }
}

export default withApiLogging(handler);
