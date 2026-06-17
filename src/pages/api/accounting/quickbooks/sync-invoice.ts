/**
 * POST /api/accounting/quickbooks/sync-invoice
 *
 * QuickBooks counterpart to the Xero sync endpoint. Pushes a single
 * CateringMS invoice to QuickBooks Online via the v3 API. Idempotent
 * via invoices.external_id (we share the column with Xero - only
 * one accounting integration is connected per company at a time, so
 * the field never collides).
 *
 * Body: { invoice_id: string }
 *
 * Auth: admin/owner in the same company, or service-role with the
 * x-cms-internal: CRON_SECRET header (used by ensureInvoiceForOrder
 * for fire-and-forget sync after auto-invoicing).
 *
 * Token refresh: QuickBooks access tokens last ~1 hour. Refresh tokens
 * last 100 days and rotate on every refresh - like Xero, we MUST
 * persist the rotated refresh_token or the next call breaks with
 * invalid_grant. POST against
 * https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer with
 * Basic auth (client_id:client_secret).
 *
 * Sandbox vs production: QUICKBOOKS_ENVIRONMENT=sandbox switches the
 * base URL to sandbox-quickbooks.api.intuit.com.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshQuickBooksToken } from "@/lib/accountingTokens";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

const QB_BASE = process.env.QUICKBOOKS_ENVIRONMENT === "production"
  ? "https://quickbooks.api.intuit.com"
  : "https://sandbox-quickbooks.api.intuit.com";

interface AccountingIntegration {
  id: string;
  company_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  tenant_id: string | null; // QuickBooks realmId
  is_active: boolean;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { invoice_id } = req.body || {};
    if (!invoice_id || typeof invoice_id !== "string") {
      return res.status(400).json({ error: "invoice_id is required" });
    }

    // Internal callers (auto-invoice path) bypass session via secret.
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
      const { data: profile, error: profileErr } = await ssr
        .from("profiles")
        .select("role, active_role, company_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileErr) {
        console.error("[accounting/quickbooks/sync-invoice] profiles fetch failed:", profileErr);
      }
      const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
      if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Owner or admin only" });
      companyIdScope = (profile as any)?.company_id || null;
    }

    const supabase: any = getServiceSupabase();

    const { data: invoice, error: invoiceErr } = await supabase
      .from("invoices")
      .select("id, company_id, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount, status, external_id, client_id, order_id, last_synced_at")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invoiceErr) {
      console.error("[accounting/quickbooks/sync-invoice] invoices fetch failed:", invoiceErr);
    }
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (!isInternal && (!companyIdScope || companyIdScope !== invoice.company_id)) {
      return res.status(403).json({ error: "Wrong company" });
    }

    if (invoice.external_id) {
      // Phase 4 #4 conflict guard happens after the ai + token
      // lookup below. Mark it for the post-ai branch by leaving the
      // alreadySynced short-circuit to fall through.
    }

    const { data: integration, error: integrationErr } = await supabase
      .from("accounting_integrations")
      .select("*")
      .eq("company_id", invoice.company_id)
      .eq("provider", "quickbooks")
      .eq("is_active", true)
      .maybeSingle();
    if (integrationErr) {
      console.error("[accounting/quickbooks/sync-invoice] accounting_integrations fetch failed:", integrationErr);
    }
    const ai = integration as AccountingIntegration | null;
    if (!ai || !ai.tenant_id) {
      return res.status(409).json({ error: "QuickBooks is not connected for this company" });
    }

    let accessToken = await ensureFreshAccessToken(supabase, ai);
    if (!accessToken) {
      return res.status(502).json({ error: "Could not obtain a QuickBooks access token" });
    }

    // Phase 4 #4: two-way conflict guard. Symmetrical to the Xero
    // sync's update-mode drift check. If we already pushed this
    // invoice to QB and someone has edited it on the QB side since
    // (e.g. the bookkeeper changed the line description), we refuse
    // to clobber and force the operator to reconcile manually. The
    // fallback short-circuit below preserves existing behaviour --
    // safe to retry when QB has nothing new.
    if (invoice.external_id) {
      try {
        const driftResp = await fetch(
          `${QB_BASE}/v3/company/${ai.tenant_id}/invoice/${invoice.external_id}?minorversion=70`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          },
        );
        // 401 retry mirrors the create path - a stale token
        // mid-call would otherwise look like a missing invoice.
        let driftBody: any = null;
        if (driftResp.status === 401) {
          const refreshed = await ensureFreshAccessToken(supabase, ai, { force: true });
          if (refreshed) {
            accessToken = refreshed;
            const retry = await fetch(
              `${QB_BASE}/v3/company/${ai.tenant_id}/invoice/${invoice.external_id}?minorversion=70`,
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: "application/json",
                },
              },
            );
            driftBody = await retry.json().catch(() => ({}));
          }
        } else {
          driftBody = await driftResp.json().catch(() => ({}));
        }
        const remoteUpdated: string | undefined =
          driftBody?.Invoice?.MetaData?.LastUpdatedTime;
        const ourLast = invoice.last_synced_at
          ? new Date(invoice.last_synced_at).getTime()
          : 0;
        const theirLast = remoteUpdated ? Date.parse(remoteUpdated) : 0;
        if (Number.isFinite(theirLast) && theirLast > 0 && ourLast && theirLast > ourLast) {
          const message =
            "QuickBooks has changes since the last sync. Reconcile manually before re-pushing.";
          await supabase
            .from("invoices")
            .update({ sync_error: message })
            .eq("id", invoice.id);
          return res.status(409).json({
            error: message,
            conflict: true,
            quickbooksLastUpdatedTime: remoteUpdated,
            ourLastSyncedAt: invoice.last_synced_at,
          });
        }
      } catch (driftErr) {
        // Drift check failure shouldn't block an alreadySynced
        // response - conservative, matches the prior shape.
        console.warn("[quickbooks/sync-invoice] drift check failed:", driftErr);
      }
      return res.status(200).json({ ok: true, alreadySynced: true, externalId: invoice.external_id });
    }

    // Build the customer ref. QuickBooks needs an existing customer
    // id (Customer.Id) - if we don't have one cached we look it up
    // by email, falling back to creating a new customer.
    const { data: client } = invoice.client_id
      ? await supabase
          .from("clients")
          .select("client_name, email, phone")
          .eq("id", invoice.client_id)
          .maybeSingle()
      : { data: null };

    const customerId = await ensureQuickBooksCustomer(
      accessToken,
      ai.tenant_id,
      client?.client_name || "Client",
      client?.email || null,
    );
    if (!customerId) {
      return res.status(502).json({ error: "Could not resolve QuickBooks customer" });
    }

    const subtotal = Number(invoice.subtotal || invoice.total_amount || 0);
    const qbPayload = {
      CustomerRef: { value: customerId },
      DocNumber: invoice.invoice_number,
      TxnDate: invoice.invoice_date,
      DueDate: invoice.due_date,
      Line: [
        {
          DetailType: "SalesItemLineDetail",
          Amount: subtotal,
          Description: `Catering services - invoice ${invoice.invoice_number}`,
          SalesItemLineDetail: {
            ItemRef: { value: process.env.QUICKBOOKS_DEFAULT_ITEM_ID || "1" },
          },
        },
      ],
      PrivateNote: `CateringMS:${invoice.id}`,
    };

    const postInvoice = (token: string) =>
      fetch(`${QB_BASE}/v3/company/${ai.tenant_id}/invoice?minorversion=70`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(qbPayload),
      });
    let resp = await postInvoice(accessToken);
    // Phase 3 #7: 401 retry. QuickBooks can invalidate an access
    // token early (clock skew, intuit manual revoke, reconnect).
    // Force a refresh + retry once to match the Xero sync behaviour.
    if (resp.status === 401) {
      const refreshed = await ensureFreshAccessToken(supabase, ai, { force: true });
      if (refreshed) {
        accessToken = refreshed;
        resp = await postInvoice(accessToken);
      }
    }
    const qbBody: any = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const message =
        qbBody?.Fault?.Error?.[0]?.Message ||
        qbBody?.Fault?.Error?.[0]?.Detail ||
        qbBody?.error_description ||
        `QuickBooks responded ${resp.status}`;
      await supabase
        .from("accounting_integrations")
        .update({ sync_errors: [{ at: new Date().toISOString(), message }] })
        .eq("id", ai.id);
      await supabase
        .from("invoices")
        .update({ sync_error: message })
        .eq("id", invoice.id);
      return res.status(502).json({ error: message, status: resp.status });
    }

    const qbInvoice = qbBody?.Invoice;
    if (!qbInvoice?.Id) {
      return res.status(502).json({ error: "QuickBooks returned no invoice Id", body: qbBody });
    }

    await supabase
      .from("invoices")
      .update({
        external_id: qbInvoice.Id,
        external_invoice_number: qbInvoice.DocNumber || invoice.invoice_number,
        synced_to_accounting: true,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", invoice.id);

    if (invoice.order_id) {
      // We share the xero_invoice_id column for the parent-order
      // back-link since only one accounting provider is connected
      // per tenant at a time. A future provider-agnostic
      // accounting_invoice_id rename would be cleaner.
      await supabase
        .from("orders")
        .update({
          xero_invoice_id: qbInvoice.Id,
          xero_synced_at: new Date().toISOString(),
        })
        .eq("id", invoice.order_id);
    }

    await supabase
      .from("accounting_integrations")
      .update({ last_sync_at: new Date().toISOString(), sync_errors: null })
      .eq("id", ai.id);

    return res.status(200).json({
      ok: true,
      externalId: qbInvoice.Id,
      externalNumber: qbInvoice.DocNumber,
    });
  } catch (err: any) {
    console.error("[quickbooks/sync-invoice] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Sync failed" });
  }
}

// Phase 5 #6: shared helper. Same shape as the Xero variants - a
// fix to the refresh logic (force-flag, retry behaviour, future
// encryption layer) lands once for all three sync endpoints. The
// import lives at the top of the file with the other modules; this
// thin wrapper preserves the original local function's call site.
async function ensureFreshAccessToken(
  supabase: any,
  integration: AccountingIntegration,
  opts: { force?: boolean } = {},
): Promise<string | null> {
  return ensureFreshQuickBooksToken(supabase, integration, opts);
}

/**
 * Resolve an existing QuickBooks customer by email, or create one.
 * QuickBooks requires Invoice.CustomerRef to point at a real
 * Customer.Id - there's no inline customer create on Invoice POST.
 */
async function ensureQuickBooksCustomer(
  accessToken: string,
  realmId: string,
  name: string,
  email: string | null,
): Promise<string | null> {
  // 1. Try lookup by email if we have one.
  if (email) {
    const queryResp = await fetch(
      `${QB_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(`select Id from Customer where PrimaryEmailAddr = '${email.replace(/'/g, "''")}'`)}&minorversion=70`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    if (queryResp.ok) {
      const queryBody: any = await queryResp.json().catch(() => ({}));
      const found = queryBody?.QueryResponse?.Customer?.[0]?.Id;
      if (found) return String(found);
    }
  }

  // 2. Create.
  const createResp = await fetch(`${QB_BASE}/v3/company/${realmId}/customer?minorversion=70`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      DisplayName: name,
      ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
    }),
  });
  if (!createResp.ok) {
    const body = await createResp.text();
    console.warn("[quickbooks] customer create failed:", body);
    return null;
  }
  const body: any = await createResp.json().catch(() => ({}));
  return body?.Customer?.Id ? String(body.Customer.Id) : null;
}

export default withApiLogging(handler);
