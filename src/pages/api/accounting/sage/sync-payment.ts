/**
 * POST /api/accounting/sage/sync-payment
 *
 * Wave 70.1 - Sage Business Cloud payment push. Mirror of
 * xero/sync-payment.ts for the Sage provider.
 *
 * When CateringMS records a payment against an invoice that has
 * already been pushed to Sage (invoice.external_id set), this
 * endpoint creates a Sage contact_payment so the balance there
 * matches ours. Idempotent via
 * payments.gateway_response->>sage_payment_id (payments has no
 * external_id column - that lives on invoices).
 *
 * Sage Business Cloud Accounting API v3.1:
 *   POST /v3.1/contact_payments
 *   {
 *     contact_payment: {
 *       transaction_type_id: 'CUSTOMER_RECEIPT',
 *       contact_id, bank_account_id, date, total_amount,
 *       payment_method_id, reference,
 *       allocated_artefacts: [{ artefact_id, amount }]
 *     }
 *   }
 *
 * Test against a Sage sandbox before pointing at live.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getValidAccessToken } from "@/services/accountingIntegrationService";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const SAGE_API = "https://api.accounting.sage.com/v3.1";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { payment_id } = req.body || {};
    if (!payment_id || typeof payment_id !== "string") {
      return res.status(400).json({ error: "payment_id is required" });
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

    // NOTE: `payments` has NO external_id / synced_at columns (those are
    // on `invoices`). Selecting external_id here 400s the whole query →
    // payment came back null → 404 on every call. We read/write the Sage
    // payment id from `gateway_response` JSON instead.
    const { data: payment } = await admin
      .from("payments")
      .select("id, company_id, invoice_id, amount, payment_method, processed_at, gateway_response, payment_reference")
      .eq("id", payment_id)
      .maybeSingle();
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (!isInternal && (!companyIdScope || companyIdScope !== payment.company_id)) {
      return res.status(403).json({ error: "Wrong company" });
    }
    const existingGateway =
      payment.gateway_response && typeof payment.gateway_response === "object"
        ? (payment.gateway_response as Record<string, any>)
        : {};
    if (existingGateway.sage_payment_id) {
      return res.status(200).json({ ok: true, alreadySynced: true, externalId: existingGateway.sage_payment_id });
    }

    const { data: invoice } = await admin
      .from("invoices")
      .select("id, external_id, client_id, invoice_number")
      .eq("id", payment.invoice_id)
      .maybeSingle();
    if (!invoice?.external_id) {
      return res.status(412).json({
        error: "Source invoice hasn't been pushed to Sage yet. Sync the invoice first, then retry the payment.",
      });
    }

    const tokenRes = await getValidAccessToken(payment.company_id, "sage");
    if (!tokenRes.success || !tokenRes.accessToken) {
      return res.status(401).json({ error: tokenRes.error || "No active Sage connection" });
    }
    const accessToken = tokenRes.accessToken;

    const { data: integration } = await admin
      .from("accounting_integrations")
      .select("metadata")
      .eq("company_id", payment.company_id)
      .eq("provider", "sage")
      .maybeSingle();
    const meta = ((integration as any)?.metadata || {}) as {
      default_bank_account_id?: string;
      default_payment_method_id?: string;
    };

    if (!meta.default_bank_account_id) {
      return res.status(412).json({
        error: "Sage default bank account not configured. Set it on /admin/integrations -> Sage first.",
      });
    }

    // Find the contact_id from the original invoice push. Sage's
    // sales_invoices response includes it; we re-read the invoice to
    // get it back. Falls back to a lookup by client email.
    const invRead = await fetch(`${SAGE_API}/sales_invoices/${invoice.external_id}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!invRead.ok) {
      const errBody = await invRead.text().catch(() => "");
      return res.status(502).json({ error: `Sage invoice read failed: ${invRead.status} ${errBody.slice(0, 200)}` });
    }
    const sageInvoice = await invRead.json().catch(() => null) as { contact?: { id?: string } } | null;
    const contactId = sageInvoice?.contact?.id;
    if (!contactId) {
      return res.status(502).json({ error: "Sage invoice has no contact id (unexpected)" });
    }

    const processedDate = payment.processed_at
      ? new Date(payment.processed_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const reference = payment.payment_reference || `CMS-${payment.id.slice(0, 8)}`;

    const payload = {
      contact_payment: {
        transaction_type_id: "CUSTOMER_RECEIPT",
        contact_id: contactId,
        bank_account_id: meta.default_bank_account_id,
        date: processedDate,
        total_amount: Number(payment.amount || 0),
        payment_method_id: meta.default_payment_method_id || undefined,
        reference,
        allocated_artefacts: [{
          artefact_id: invoice.external_id,
          amount: Number(payment.amount || 0),
        }],
      },
    };

    const create = await fetch(`${SAGE_API}/contact_payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!create.ok) {
      const errBody = await create.text().catch(() => "");
      return res.status(502).json({
        error: `Sage payment create failed: ${create.status}`,
        detail: errBody.slice(0, 500),
      });
    }
    const created = await create.json().catch(() => null) as { id?: string } | null;
    if (!created?.id) {
      return res.status(502).json({ error: "Sage returned no payment id" });
    }

    // `payments` has no external_id/synced_at columns; persist the Sage
    // payment id + sync flag inside gateway_response JSON (merged).
    await admin
      .from("payments")
      .update({
        gateway_response: {
          ...existingGateway,
          sage_payment_id: created.id,
          synced_to_accounting: true,
          sage_synced_at: new Date().toISOString(),
        },
      })
      .eq("id", payment_id);

    try {
      await admin.from("audit_logs").insert({
        company_id: payment.company_id,
        action: "sage_payment_synced",
        entity_type: "payment",
        entity_id: payment_id,
        details: { external_id: created.id, invoice_id: invoice.id },
      });
    } catch (auditErr) {
      console.warn("[accounting/sage/sync-payment] audit insert failed:", auditErr);
    }

    return res.status(200).json({ ok: true, externalId: created.id });
  } catch (err: any) {
    console.error("[accounting/sage/sync-payment] crashed:", err);
    return res.status(500).json({ error: err?.message || "Sage payment sync crashed" });
  }
}

export default withApiLogging(handler);
