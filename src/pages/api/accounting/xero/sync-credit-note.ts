/**
 * POST /api/accounting/xero/sync-credit-note
 *
 * Creates a Xero credit note linked to a previously-synced invoice
 * to reflect a cancellation refund. Idempotent via
 * payments.external_id (the refund payment row stores Xero's
 * CreditNoteID once written).
 *
 * P1-24 from the 2026-05 audit: a cancellation refund leaves Xero
 * out of sync until someone manually issues a credit note. This
 * fires automatically from the cancel flow when Xero is connected.
 *
 * Body:
 *   { refund_payment_id: string }
 *
 * Auth: caller is admin/owner in the same company as the refund
 * payment, OR x-cms-internal: <CRON_SECRET> for the cancel-flow
 * fire-and-forget.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const XERO_API = "https://api.xero.com/api.xro/2.0";

interface XeroSettings {
  company_id: string;
  is_connected: boolean;
  push_invoices_to_xero: boolean;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  xero_tenant_id: string | null;
  default_account_code: string | null;
  default_tax_type: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { refund_payment_id } = req.body || {};
    if (!refund_payment_id || typeof refund_payment_id !== "string") {
      return res.status(400).json({ error: "refund_payment_id is required" });
    }

    const internalAuth = req.headers["x-cms-internal"];
    const isInternal =
      typeof internalAuth === "string" &&
      process.env.CRON_SECRET &&
      internalAuth === process.env.CRON_SECRET;

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

    const supabase: any = getServiceSupabase();

    const { data: payment } = await supabase
      .from("payments")
      .select("id, company_id, order_id, amount, payment_type, payment_status, external_id, reason")
      .eq("id", refund_payment_id)
      .maybeSingle();
    if (!payment) return res.status(404).json({ error: "Refund payment not found" });
    if (payment.payment_type !== "refund") {
      return res.status(400).json({ error: "Payment is not a refund" });
    }
    if (!isInternal && companyIdScope && companyIdScope !== payment.company_id) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // Idempotency: if we already wrote a credit note for this refund,
    // bail out cleanly.
    if (payment.external_id) {
      return res.status(200).json({ ok: true, alreadySynced: true, externalId: payment.external_id });
    }

    // We need the original invoice's Xero ID to link the credit note.
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, invoice_number, external_id, client_id")
      .eq("order_id", payment.order_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!invoice || !invoice.external_id) {
      return res.status(409).json({
        error: "Original invoice has no Xero external_id; sync the invoice first.",
      });
    }

    const { data: settings } = await supabase
      .from("xero_integration_settings")
      .select("*")
      .eq("company_id", payment.company_id)
      .maybeSingle();
    const xs = settings as XeroSettings | null;
    if (!xs || !xs.is_connected || !xs.xero_tenant_id) {
      return res.status(409).json({ error: "Xero is not connected for this company" });
    }
    if (xs.push_invoices_to_xero === false) {
      return res.status(409).json({ error: "Push to Xero is disabled in settings" });
    }

    let accessToken = await ensureFreshAccessToken(supabase, xs);
    if (!accessToken) {
      return res.status(502).json({ error: "Could not obtain a Xero access token" });
    }

    const { data: client } = invoice.client_id
      ? await supabase
          .from("clients")
          .select("client_name, email")
          .eq("id", invoice.client_id)
          .maybeSingle()
      : { data: null };

    const lineAccountCode = xs.default_account_code || "200";
    const taxType = xs.default_tax_type || "OUTPUT";
    const refundAmount = Number(payment.amount || 0);
    const today = new Date().toISOString().split("T")[0];

    // Xero credit note shape. We allocate the credit note against the
    // original invoice in a follow-up call so the original invoice's
    // amount-due drops by the refund amount.
    const creditNotePayload = {
      Type: "ACCRECCREDIT",
      Date: today,
      Status: "AUTHORISED",
      Reference: `CateringMS:refund:${payment.id}`,
      Contact: client
        ? { Name: client.client_name || "Client", EmailAddress: client.email || undefined }
        : { Name: "Unknown client" },
      LineItems: [
        {
          Description: payment.reason || `Cancellation refund for invoice ${invoice.invoice_number}`,
          Quantity: 1,
          UnitAmount: refundAmount,
          AccountCode: lineAccountCode,
          TaxType: taxType,
        },
      ],
    };

    const postCredit = (token: string) =>
      fetch(`${XERO_API}/CreditNotes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Xero-Tenant-Id": xs.xero_tenant_id!,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ CreditNotes: [creditNotePayload] }),
      });

    let resp = await postCredit(accessToken);
    if (resp.status === 401) {
      const refreshed = await ensureFreshAccessToken(supabase, xs, { force: true });
      if (refreshed) {
        accessToken = refreshed;
        resp = await postCredit(accessToken);
      }
    }
    const xeroBody: any = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const message =
        xeroBody?.Detail ||
        xeroBody?.Message ||
        xeroBody?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
        `Xero responded ${resp.status}`;
      await supabase
        .from("xero_integration_settings")
        .update({ last_sync_error: message })
        .eq("company_id", payment.company_id);
      return res.status(502).json({ error: message, status: resp.status });
    }

    const creditNote = xeroBody?.CreditNotes?.[0];
    const creditNoteId: string | undefined = creditNote?.CreditNoteID;
    if (!creditNoteId) {
      return res.status(502).json({ error: "Xero returned no CreditNoteID", body: xeroBody });
    }

    // Allocate the credit note against the original invoice. Failure
    // here is non-fatal -- the credit note is in Xero, the operator
    // can allocate manually.
    try {
      await fetch(`${XERO_API}/CreditNotes/${creditNoteId}/Allocations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": xs.xero_tenant_id,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Allocations: [
            {
              Amount: refundAmount,
              Date: today,
              Invoice: { InvoiceID: invoice.external_id },
            },
          ],
        }),
      });
    } catch (e: any) {
      console.warn("[xero/sync-credit-note] allocation failed (non-fatal):", e?.message);
    }

    // Persist the Xero ID back onto the refund payment row so we
    // don't double-issue.
    await supabase
      .from("payments")
      .update({
        external_id: creditNoteId,
        synced_to_accounting: true,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return res.status(200).json({ ok: true, externalId: creditNoteId });
  } catch (err: any) {
    console.error("[xero/sync-credit-note] crashed:", err);
    return res.status(500).json({ error: err?.message || "Credit-note sync failed" });
  }
}

async function ensureFreshAccessToken(
  supabase: any,
  settings: XeroSettings,
  opts: { force?: boolean } = {},
): Promise<string | null> {
  if (!settings.access_token_encrypted) return null;
  const expiresAt = settings.token_expires_at ? new Date(settings.token_expires_at).getTime() : 0;
  const now = Date.now();
  const fresh = expiresAt - now > 60 * 1000;
  if (fresh && !opts.force) return settings.access_token_encrypted;
  if (!settings.refresh_token_encrypted) return null;

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const tokenResp = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.refresh_token_encrypted,
    }),
  });
  if (!tokenResp.ok) return null;
  const tokens: any = await tokenResp.json();
  const newAccess: string = tokens.access_token;
  const newRefresh: string = tokens.refresh_token;
  const expiresIn: number = Number(tokens.expires_in || 1800);
  await supabase
    .from("xero_integration_settings")
    .update({
      access_token_encrypted: newAccess,
      refresh_token_encrypted: newRefresh,
      token_expires_at: new Date(now + expiresIn * 1000).toISOString(),
    })
    .eq("company_id", settings.company_id);
  return newAccess;
}
