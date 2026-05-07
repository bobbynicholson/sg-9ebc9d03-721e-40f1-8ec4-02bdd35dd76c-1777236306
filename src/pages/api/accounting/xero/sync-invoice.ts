/**
 * POST /api/accounting/xero/sync-invoice
 *
 * Pushes a single CateringMS invoice to Xero (item #7). Idempotent
 * via invoices.external_id -- if the invoice already has a Xero ID
 * we treat that as the desired state and return early. Skips when
 * the tenant's xero_integration_settings.push_invoices_to_xero is
 * false so the operator can pause sync without disconnecting.
 *
 * Body:
 *   { invoice_id: string }
 *
 * Auth: caller must be admin/owner in the same company as the
 * invoice. Service-role calls (auto-invoice path) bypass via the
 * x-cms-internal header + CRON_SECRET.
 *
 * Token refresh: Xero access tokens last 30 minutes. Refresh tokens
 * last 60 days and rotate on every refresh. We refresh transparently
 * when access_token expires_at is within 60s of now.
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
    const { invoice_id, mode } = req.body || {};
    if (!invoice_id || typeof invoice_id !== "string") {
      return res.status(400).json({ error: "invoice_id is required" });
    }
    const syncMode: "create" | "update" = mode === "update" ? "update" : "create";

    // Internal callers (the auto-invoice flow) hit this with a
    // shared secret instead of a session. Saves us juggling RLS
    // for service-role pushes.
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

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, company_id, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount, amount_paid, balance_due, status, external_id, client_id, order_id, last_synced_at")
      .eq("id", invoice_id)
      .maybeSingle();
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (!isInternal && companyIdScope && companyIdScope !== invoice.company_id) {
      return res.status(403).json({ error: "Wrong company" });
    }

    if (syncMode === "create") {
      // Idempotent create: never overwrite a Xero invoice we already
      // pushed. Operators wanting to update Xero send mode=update.
      if (invoice.external_id) {
        return res.status(200).json({ ok: true, alreadySynced: true, externalId: invoice.external_id });
      }
    } else {
      if (!invoice.external_id) {
        return res.status(409).json({ error: "Cannot update: invoice has not been synced yet" });
      }
    }

    const { data: settings } = await supabase
      .from("xero_integration_settings")
      .select("*")
      .eq("company_id", invoice.company_id)
      .maybeSingle();
    const xs = settings as XeroSettings | null;
    if (!xs || !xs.is_connected || !xs.xero_tenant_id) {
      return res.status(409).json({ error: "Xero is not connected for this company" });
    }
    if (xs.push_invoices_to_xero === false) {
      return res.status(409).json({ error: "Push to Xero is disabled in settings" });
    }

    // Token refresh if needed.
    let accessToken = await ensureFreshAccessToken(supabase, xs);
    if (!accessToken) {
      return res.status(502).json({ error: "Could not obtain a Xero access token" });
    }

    // Build the invoice payload.
    const { data: client } = invoice.client_id
      ? await supabase
          .from("clients")
          .select("client_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_postal_code")
          .eq("id", invoice.client_id)
          .maybeSingle()
      : { data: null };

    const lineAccountCode = xs.default_account_code || "200";
    const taxType = xs.default_tax_type || "OUTPUT";
    const xeroPayload = {
      Type: "ACCREC",
      InvoiceNumber: invoice.invoice_number,
      Date: invoice.invoice_date,
      DueDate: invoice.due_date,
      Status: invoice.status === "paid" ? "PAID" : "AUTHORISED",
      Reference: `CateringMS:${invoice.id}`,
      Contact: client
        ? {
            Name: client.client_name || "Client",
            EmailAddress: client.email || undefined,
            Phones: client.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: client.phone }] : undefined,
            Addresses: client.billing_address_line1
              ? [
                  {
                    AddressType: "POBOX",
                    AddressLine1: client.billing_address_line1,
                    AddressLine2: client.billing_address_line2 || undefined,
                    City: client.billing_city || undefined,
                    PostalCode: client.billing_postal_code || undefined,
                  },
                ]
              : undefined,
          }
        : { Name: "Unknown client" },
      LineItems: [
        {
          Description: `Catering services -- invoice ${invoice.invoice_number}`,
          Quantity: 1,
          UnitAmount: Number(invoice.subtotal || invoice.total_amount || 0),
          AccountCode: lineAccountCode,
          TaxType: taxType,
        },
      ],
    };

    // Update mode: detect Xero-side drift before overwriting.
    // P1-21 from the 2026-05 audit -- "two-way conflict handling".
    // We refuse to silently clobber Xero edits; the operator has to
    // reconcile manually (typically: pull Xero state, decide which
    // wins, then re-sync).
    if (syncMode === "update") {
      const checkResp = await xeroFetch(
        `${XERO_API}/Invoices/${invoice.external_id}`,
        { method: "GET" },
        accessToken,
        xs,
        supabase,
      );
      if (!checkResp.ok) {
        const body = await checkResp.json().catch(() => ({}));
        return res.status(502).json({
          error: body?.Message || `Could not read Xero invoice: ${checkResp.status}`,
        });
      }
      const checkBody: any = await checkResp.json().catch(() => ({}));
      const xeroUpdated = checkBody?.Invoices?.[0]?.UpdatedDateUTC;
      const ourLast = invoice.last_synced_at ? new Date(invoice.last_synced_at).getTime() : 0;
      const theirLast = parseXeroDate(xeroUpdated);
      if (theirLast && ourLast && theirLast > ourLast) {
        const message = "Xero has changes since the last sync. Reconcile manually before re-pushing.";
        await supabase
          .from("invoices")
          .update({ sync_error: message })
          .eq("id", invoice.id);
        return res.status(409).json({
          error: message,
          conflict: true,
          xeroUpdatedDateUtc: xeroUpdated,
          ourLastSyncedAt: invoice.last_synced_at,
        });
      }
      // Update path is identical to create except method=POST against
      // the resource URL with InvoiceID embedded (Xero treats this as
      // upsert) -- so we just POST the payload with InvoiceID set.
      (xeroPayload as any).InvoiceID = invoice.external_id;
    }

    const postInvoice = (token: string) =>
      fetch(`${XERO_API}/Invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Xero-Tenant-Id": xs.xero_tenant_id!,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ Invoices: [xeroPayload] }),
      });

    let resp = await postInvoice(accessToken);

    // 401 retry: Xero can invalidate a token early (clock skew, manual
    // disconnect / reconnect, scope change). Force a refresh + retry
    // once. P1-20 from the 2026-05 audit.
    if (resp.status === 401) {
      const refreshed = await ensureFreshAccessToken(supabase, xs, { force: true });
      if (refreshed) {
        accessToken = refreshed;
        resp = await postInvoice(accessToken);
      }
    }
    const xeroBody: any = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // Surface Xero's validation errors for the dashboard.
      const message =
        xeroBody?.Detail ||
        xeroBody?.Message ||
        xeroBody?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
        `Xero responded ${resp.status}`;
      await supabase
        .from("xero_integration_settings")
        .update({ last_sync_error: message })
        .eq("company_id", invoice.company_id);
      await supabase
        .from("invoices")
        .update({ sync_error: message })
        .eq("id", invoice.id);
      return res.status(502).json({ error: message, status: resp.status });
    }

    const xeroInvoice = xeroBody?.Invoices?.[0];
    if (!xeroInvoice?.InvoiceID) {
      return res.status(502).json({ error: "Xero returned no InvoiceID", body: xeroBody });
    }

    await supabase
      .from("invoices")
      .update({
        external_id: xeroInvoice.InvoiceID,
        external_invoice_number: xeroInvoice.InvoiceNumber || invoice.invoice_number,
        synced_to_accounting: true,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", invoice.id);

    // Mirror onto the order so older code paths that read xero_invoice_id
    // off the order still work. Non-blocking.
    if (invoice.order_id) {
      await supabase
        .from("orders")
        .update({
          xero_invoice_id: xeroInvoice.InvoiceID,
          xero_synced_at: new Date().toISOString(),
        })
        .eq("id", invoice.order_id);
    }

    await supabase
      .from("xero_integration_settings")
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("company_id", invoice.company_id);

    return res.status(200).json({
      ok: true,
      externalId: xeroInvoice.InvoiceID,
      externalNumber: xeroInvoice.InvoiceNumber,
    });
  } catch (err: any) {
    console.error("[xero/sync-invoice] crashed:", err);
    return res.status(500).json({ error: err?.message || "Sync failed" });
  }
}

/**
 * Refreshes the Xero access token if it's within 60s of expiry.
 * Returns a token ready to use, or null if refresh failed.
 *
 * Xero rotates the refresh_token on every call -- we MUST persist
 * the new one or the next refresh will fail with invalid_grant.
 */
/**
 * Xero serialises UpdatedDateUTC as `/Date(1234567890123+0000)/`.
 * Returns the millisecond epoch or null if the format isn't what we
 * expect (so the caller treats it as "no remote drift detected"
 * rather than triggering a false-positive conflict).
 */
function parseXeroDate(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const match = /\/Date\((\d+)/.exec(s);
  if (match) return Number(match[1]);
  // ISO fallback for the rare cases Xero returns one
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? iso : null;
}

/**
 * GET / POST wrapper that retries once on 401 by force-refreshing the
 * token. Used by the conflict-detection path (the create POST has its
 * own retry loop inline).
 */
async function xeroFetch(
  url: string,
  init: RequestInit,
  token: string,
  settings: XeroSettings,
  supabase: any,
): Promise<Response> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Xero-Tenant-Id": settings.xero_tenant_id!,
    Accept: "application/json",
    ...(init.headers || {}),
  };
  let resp = await fetch(url, { ...init, headers });
  if (resp.status === 401) {
    const refreshed = await ensureFreshAccessToken(supabase, settings, { force: true });
    if (refreshed) {
      resp = await fetch(url, { ...init, headers: { ...headers, Authorization: `Bearer ${refreshed}` } });
    }
  }
  return resp;
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

  // The columns are *_encrypted but we don't have the encryption
  // helper wired here -- treat them as opaque strings. If/when an
  // encryption layer lands, swap decrypt() in here. For now the
  // RLS scoping on xero_integration_settings is the protection.
  if (fresh && !opts.force) return settings.access_token_encrypted;

  if (!settings.refresh_token_encrypted) return null;

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn("[xero] missing XERO_CLIENT_ID / XERO_CLIENT_SECRET env");
    return null;
  }

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
  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    console.warn("[xero] token refresh failed:", body);
    return null;
  }
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
