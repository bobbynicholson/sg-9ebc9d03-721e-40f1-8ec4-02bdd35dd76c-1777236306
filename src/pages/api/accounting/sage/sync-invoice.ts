/**
 * POST /api/accounting/sage/sync-invoice
 *
 * Wave 70.1 -- Sage Business Cloud invoice push. The OAuth scaffold
 * landed in Wave 70 (authorize.ts + callback.ts). This endpoint maps
 * a CateringMS invoice to a Sage sales_invoice payload and POSTs it
 * to api.accounting.sage.com.
 *
 * Architectural cousin of xero/sync-invoice.ts. Idempotent via
 * invoices.external_id; tenant scope by role + company; service-role
 * fallback via the x-cms-internal header + CRON_SECRET for the
 * auto-invoice path.
 *
 * Sage Business Cloud Accounting API v3.1 docs:
 *   https://developer.sage.com/accounting/reference/sales-invoices/
 *
 * Payload shape:
 *   POST /v3.1/sales_invoices
 *   {
 *     sales_invoice: {
 *       contact_id, date, due_date, reference,
 *       invoice_lines: [{ description, ledger_account_id, quantity,
 *                         unit_price_includes_tax, unit_price,
 *                         tax_rate_id }]
 *     }
 *   }
 *
 * Contact ensure: looks up by email first, creates if missing. Sage
 * insists on a contact_id rather than free-text customer fields.
 *
 * Test against a Sage sandbox (https://my-sandbox.sage.com) before
 * pointing at live: the rate ids, ledger account ids and tax rate
 * ids vary per tenant. The endpoint reads them from
 * accounting_integrations.metadata (set during OAuth callback or
 * a future settings page).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getValidAccessToken } from "@/services/accountingIntegrationService";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const SAGE_API = "https://api.accounting.sage.com/v3.1";

interface SageInvoiceLine {
  description: string;
  ledger_account_id?: string | null;
  quantity: number;
  unit_price: number;
  unit_price_includes_tax: boolean;
  tax_rate_id?: string | null;
}

interface SageContactSummary {
  id: string;
  name?: string;
  email?: string;
}

async function findOrCreateContact(
  accessToken: string,
  email: string | null,
  name: string,
): Promise<{ id: string | null; error?: string }> {
  // Find by email first (Sage allows duplicates so email is the
  // de facto unique key when the tenant manages clients via CateringMS).
  if (email) {
    const search = await fetch(`${SAGE_API}/contacts?search=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (search.ok) {
      const body = await search.json().catch(() => null) as { $items?: SageContactSummary[] } | null;
      const hit = body?.$items?.find((c) => (c.email || "").toLowerCase() === email.toLowerCase());
      if (hit?.id) return { id: hit.id };
    }
  }

  // Create. CONTACT_CUSTOMER is the built-in contact type for sales.
  const create = await fetch(`${SAGE_API}/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contact: {
        name,
        email,
        contact_type_ids: ["CUSTOMER"],
      },
    }),
  });
  if (!create.ok) {
    const errBody = await create.text().catch(() => "");
    return { id: null, error: `Sage contact create failed: ${create.status} ${errBody.slice(0, 200)}` };
  }
  const created = await create.json().catch(() => null) as { id?: string } | null;
  return { id: created?.id || null };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { invoice_id } = req.body || {};
    if (!invoice_id || typeof invoice_id !== "string") {
      return res.status(400).json({ error: "invoice_id is required" });
    }

    const internalAuth = req.headers["x-cms-internal"];
    const isInternal =
      typeof internalAuth === "string"
      && process.env.CRON_SECRET
      && internalAuth === process.env.CRON_SECRET;

    let companyIdScope: string | null = null;

    if (!isInternal) {
      const ssr = createPagesServerClient({ req, res });
      const { data: { user } } = await ssr.auth.getUser();
      if (!user) return res.status(401).json({ error: "Not signed in" });
      const { data: profile } = await ssr
        .from("profiles")
        .select("role, active_role, company_id")
        .eq("id", user.id)
        .maybeSingle();
      const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
      if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Owner or admin only" });
      companyIdScope = (profile as any)?.company_id || null;
    }

    const admin: any = getServiceSupabase();

    const { data: invoice } = await admin
      .from("invoices")
      .select("id, company_id, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount, external_id, client_id, order_id")
      .eq("id", invoice_id)
      .maybeSingle();
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (!isInternal && companyIdScope && companyIdScope !== invoice.company_id) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // Idempotency: already synced -> short-circuit.
    if (invoice.external_id) {
      return res.status(200).json({ ok: true, alreadySynced: true, externalId: invoice.external_id });
    }

    // Token refresh handled by the unified service.
    const tokenRes = await getValidAccessToken(invoice.company_id, "sage");
    if (!tokenRes.success || !tokenRes.accessToken) {
      return res.status(401).json({ error: tokenRes.error || "No active Sage connection. Reconnect from /admin/integrations." });
    }
    const accessToken = tokenRes.accessToken;

    // Pull client + lines + integration metadata (ledger + tax ids).
    const [clientRes, linesRes, integrationRes] = await Promise.all([
      invoice.client_id
        ? admin.from("clients").select("id, client_name, email").eq("id", invoice.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("invoice_line_items")
        .select("description, quantity, unit_price, line_total")
        .eq("invoice_id", invoice_id),
      admin.from("accounting_integrations")
        .select("metadata")
        .eq("company_id", invoice.company_id)
        .eq("provider", "sage")
        .maybeSingle(),
    ]);

    const meta = ((integrationRes.data as any)?.metadata || {}) as {
      default_ledger_account_id?: string;
      default_tax_rate_id?: string;
      prices_include_tax?: boolean;
    };

    if (!meta.default_ledger_account_id) {
      return res.status(412).json({
        error: "Sage default ledger account not configured. Open /admin/integrations -> Sage and pick a default sales account first.",
      });
    }

    const client = clientRes.data as { client_name?: string; email?: string } | null;
    const clientName = client?.client_name?.trim() || "Customer";
    const clientEmail = client?.email?.trim() || null;
    const includesTax = meta.prices_include_tax === true;

    // Map lines. Empty fallback to a single line for the invoice total
    // when invoice_line_items wasn't populated (legacy invoices).
    const rawLines = (linesRes.data || []) as Array<{ description?: string; quantity?: number; unit_price?: number; line_total?: number }>;
    const sageLines: SageInvoiceLine[] = rawLines.length > 0
      ? rawLines.map((l) => ({
          description: l.description || "Service",
          quantity: Number(l.quantity || 1),
          unit_price: Number(l.unit_price || l.line_total || 0),
          unit_price_includes_tax: includesTax,
          ledger_account_id: meta.default_ledger_account_id || null,
          tax_rate_id: meta.default_tax_rate_id || null,
        }))
      : [{
          description: `Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}`,
          quantity: 1,
          unit_price: Number(invoice.total_amount || 0),
          unit_price_includes_tax: includesTax,
          ledger_account_id: meta.default_ledger_account_id || null,
          tax_rate_id: meta.default_tax_rate_id || null,
        }];

    // Ensure contact -> get sage contact_id.
    const contact = await findOrCreateContact(accessToken, clientEmail, clientName);
    if (!contact.id) {
      return res.status(502).json({ error: contact.error || "Sage contact lookup failed" });
    }

    // Build the sales_invoice payload + push.
    const payload = {
      sales_invoice: {
        contact_id: contact.id,
        date: invoice.invoice_date,
        due_date: invoice.due_date,
        reference: invoice.invoice_number || invoice.id.slice(0, 8),
        invoice_lines: sageLines,
      },
    };

    const createInvoice = await fetch(`${SAGE_API}/sales_invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!createInvoice.ok) {
      const errBody = await createInvoice.text().catch(() => "");
      return res.status(502).json({
        error: `Sage invoice create failed: ${createInvoice.status}`,
        detail: errBody.slice(0, 500),
      });
    }
    const created = await createInvoice.json().catch(() => null) as { id?: string; reference?: string } | null;
    if (!created?.id) {
      return res.status(502).json({ error: "Sage returned no invoice id" });
    }

    // Stamp the external_id so we never double-push.
    await admin
      .from("invoices")
      .update({
        external_id: created.id,
        synced_to_accounting: true,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", invoice_id);

    try {
      await admin.from("audit_logs").insert({
        company_id: invoice.company_id,
        action: "sage_invoice_synced",
        entity_type: "invoice",
        entity_id: invoice_id,
        details: { external_id: created.id, sage_reference: created.reference },
      });
    } catch (auditErr) {
      console.warn("[accounting/sage/sync-invoice] audit insert failed:", auditErr);
    }

    return res.status(200).json({ ok: true, externalId: created.id, sageReference: created.reference });
  } catch (err: any) {
    console.error("[accounting/sage/sync-invoice] crashed:", err);
    return res.status(500).json({ error: err?.message || "Sage sync crashed" });
  }
}
