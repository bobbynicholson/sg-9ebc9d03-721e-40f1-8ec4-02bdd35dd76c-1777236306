/**
 * POST /api/accounting/xero/void-invoices - Wave 70.51b
 *
 * Pushes Xero VOID for every locally-voided invoice tied to an order
 * (i.e. invoices the cancel cascade already flipped to status='voided'
 * via Wave 70.51a). Idempotent via invoices.xero_voided_at.
 *
 * Why this exists: the cancel cascade voids invoices in our DB but
 * the Xero copy stayed live. The catering company's Xero ledger
 * ended up with parallel invoice + credit-note rows for every
 * cancellation - the accountant had to manually reconcile.
 *
 * Xero contract: VOID is only valid for invoices that have no
 * payments allocated. Paid / partially-paid invoices continue through
 * the existing /sync-credit-note path - their original invoice
 * stays AUTHORISED in Xero and the credit-note is the offset entry
 * (which IS the correct accounting treatment for paid-then-refunded).
 *
 * Body:
 *   { order_id: string }
 *
 * Auth: caller is admin/owner in the same company as the order, OR
 * x-cms-internal: <CRON_SECRET> for the cancel-flow fire-and-forget.
 *
 * Response:
 *   {
 *     ok: true,
 *     attempted: number,    // total invoices we tried to void
 *     voided: number,       // successfully voided in Xero
 *     skipped: number,      // already voided / no Xero ID / had payments
 *     failed: number,       // Xero returned an error
 *     results: Array<{ invoice_id, action, message? }>
 *   }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshXeroToken } from "@/lib/accountingTokens";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


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
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { order_id } = req.body || {};
    if (!order_id || typeof order_id !== "string") {
      return res.status(400).json({ error: "order_id is required" });
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

    // Fetch every locally-voided invoice for this order that has a Xero
    // external_id and hasn't already been voided on the Xero side.
    // Filtering on status='voided' (not the legacy 'written_off') so
    // we only operate on Wave 70.51a-era voids. amount_paid=0 enforces
    // the Xero contract that VOID only applies to fully-unpaid invoices.
    const { data: invoices, error: invErr } = await supabase
      .from("invoices")
      .select("id, company_id, external_id, status, amount_paid, invoice_number")
      .eq("order_id", order_id)
      .eq("status", "voided")
      .not("external_id", "is", null)
      .is("xero_voided_at", null);
    if (invErr) {
      console.error("[xero/void-invoices] fetch failed:", invErr);
      return res.status(500).json({ error: dbErrorMessage(invErr) });
    }

    const rows = (invoices as any[]) || [];
    if (rows.length === 0) {
      return res.status(200).json({
        ok: true, attempted: 0, voided: 0, skipped: 0, failed: 0, results: [],
      });
    }

    // Tenant gate - all invoices for this order share the same
    // company_id; check on the first one.
    const orderCompanyId = rows[0].company_id;
    if (!isInternal && (!companyIdScope || companyIdScope !== orderCompanyId)) {
      return res.status(403).json({ error: "Wrong company" });
    }

    const { data: settings } = await supabase
      .from("xero_integration_settings")
      .select("*")
      .eq("company_id", orderCompanyId)
      .maybeSingle();
    const xs = settings as XeroSettings | null;
    if (!xs || !xs.is_connected || !xs.xero_tenant_id) {
      return res.status(409).json({ error: "Xero is not connected for this company" });
    }
    if (xs.push_invoices_to_xero === false) {
      return res.status(409).json({ error: "Push to Xero is disabled in settings" });
    }

    let accessToken = await ensureFreshXeroToken(supabase, xs);
    if (!accessToken) {
      return res.status(502).json({ error: "Could not obtain a Xero access token" });
    }

    const results: Array<{ invoice_id: string; action: string; message?: string }> = [];
    let voided = 0;
    let skipped = 0;
    let failed = 0;

    for (const inv of rows) {
      // Hard skip if paid - Xero rejects VOID on invoices with
      // allocated payments. The credit-note path is the right one
      // for these and is already handled by /sync-credit-note.
      if (Number(inv.amount_paid || 0) > 0) {
        results.push({
          invoice_id: inv.id,
          action: "skipped_paid",
          message: "Invoice has payments allocated; use credit-note flow instead.",
        });
        skipped += 1;
        continue;
      }

      const postVoid = (token: string) =>
        fetch(`${XERO_API}/Invoices/${inv.external_id}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Xero-Tenant-Id": xs.xero_tenant_id!,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Invoices: [{ InvoiceID: inv.external_id, Status: "VOIDED" }],
          }),
        });

      let resp = await postVoid(accessToken);
      if (resp.status === 401) {
        const refreshed = await ensureFreshXeroToken(supabase, xs, { force: true });
        if (refreshed) {
          accessToken = refreshed;
          resp = await postVoid(accessToken);
        }
      }
      const body: any = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const message =
          body?.Detail ||
          body?.Message ||
          body?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
          `Xero responded ${resp.status}`;
        results.push({ invoice_id: inv.id, action: "failed", message });
        failed += 1;
        // Record the error on the integration settings (last_sync_error)
        // so the operator dashboard sees something went wrong.
        await supabase
          .from("xero_integration_settings")
          .update({ last_sync_error: `void ${inv.invoice_number}: ${message}` })
          .eq("company_id", orderCompanyId);
        continue;
      }

      // Success - stamp the local row so we never re-attempt.
      await supabase
        .from("invoices")
        .update({
          xero_voided_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", inv.id);
      results.push({ invoice_id: inv.id, action: "voided" });
      voided += 1;
    }

    return res.status(200).json({
      ok: failed === 0,
      attempted: rows.length,
      voided,
      skipped,
      failed,
      results,
    });
  } catch (err: any) {
    console.error("[xero/void-invoices] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Void-invoices sync failed" });
  }
}

export default withApiLogging(handler);
