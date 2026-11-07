import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { effectiveProfileRole } from "@/lib/roleDerivation";
import { getIntegrationStatus, syncInvoiceToAccounting, type InvoiceData } from "@/services/accountingIntegrationService";
import { withApiLogging } from "@/lib/withApiLogging";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });

  const { data: profile } = await ssr
    .from("profiles")
    .select("role, active_role, company_id, is_active, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false || profile.deleted_at) {
    return res.status(403).json({ error: "Account access denied" });
  }
  if (!ALLOWED_ROLES.has(effectiveProfileRole(profile))) {
    return res.status(403).json({ error: "Owner or admin only" });
  }
  if (!profile.company_id) return res.status(403).json({ error: "Company access required" });

  const invoiceId = req.body?.invoice_id;
  if (typeof invoiceId !== "string" || !UUID_RE.test(invoiceId)) {
    return res.status(400).json({ error: "A valid invoice_id is required" });
  }

  try {
    const admin = getServiceSupabase();
    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id, company_id, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount, status, invoice_data, external_id, synced_to_accounting")
      .eq("id", invoiceId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (invoiceError) return res.status(500).json({ error: "Could not load invoice" });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const alreadySynced = !!invoice.external_id || invoice.synced_to_accounting === true;
    if (alreadySynced && req.body?.confirm_duplicate !== true) {
      return res.status(409).json({ error: "This invoice was already synced. Confirm the duplicate sync in the app and try again." });
    }

    const xero = await getIntegrationStatus(profile.company_id, "xero");
    const quickbooks = await getIntegrationStatus(profile.company_id, "quickbooks");
    const provider = xero.connected ? "xero" : quickbooks.connected ? "quickbooks" : null;
    if (!provider) return res.status(409).json({ error: "No Xero or QuickBooks integration is connected" });

    const snapshot = invoice.invoice_data && typeof invoice.invoice_data === "object"
      ? invoice.invoice_data as Record<string, any>
      : {};
    const invoiceData: InvoiceData = {
      invoiceNumber: String(invoice.invoice_number || ""),
      invoiceDate: String(invoice.invoice_date || ""),
      dueDate: String(invoice.due_date || ""),
      clientName: String(snapshot.clientName || "Client"),
      clientCompanyName: typeof snapshot.clientCompanyName === "string" ? snapshot.clientCompanyName : null,
      clientEmail: String(snapshot.clientEmail || ""),
      items: Array.isArray(snapshot.items) ? snapshot.items : [],
      subtotal: Number(invoice.subtotal || 0),
      taxAmount: Number(invoice.tax_amount ?? snapshot.taxAmount ?? 0),
      total: Number(invoice.total_amount || 0),
      status: invoice.status === "paid" ? "paid" : "sent",
    };
    if (!invoiceData.invoiceNumber || !invoiceData.invoiceDate || !invoiceData.dueDate) {
      return res.status(422).json({ error: "Invoice data is incomplete; update the invoice before syncing" });
    }

    const result = await syncInvoiceToAccounting(profile.company_id, provider, invoiceData);
    if (!result.success) {
      return res.status(502).json({ error: result.error || "Accounting sync failed" });
    }

    const { error: updateError } = await admin
      .from("invoices")
      .update({
        external_id: result.externalId || null,
        external_invoice_number: result.externalInvoiceNumber || null,
        synced_to_accounting: true,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", invoice.id)
      .eq("company_id", profile.company_id);
    if (updateError) {
      console.error("[accounting/legacy/sync-invoice] invoice sync marker update failed");
      return res.status(502).json({ error: "Invoice reached accounting, but its sync status could not be saved. Contact support before retrying." });
    }

    return res.status(200).json({
      success: true,
      provider,
      externalId: result.externalId,
      externalInvoiceNumber: result.externalInvoiceNumber,
    });
  } catch {
    console.error("[accounting/legacy/sync-invoice] request failed");
    return res.status(500).json({ error: "Accounting sync failed. Please retry or reconnect the integration." });
  }
}

export default withApiLogging(handler);
