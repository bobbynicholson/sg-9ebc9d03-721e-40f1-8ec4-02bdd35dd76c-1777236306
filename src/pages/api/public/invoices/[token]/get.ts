/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FIX (2026-06-12): GET /api/public/invoices/[token]/get
 *
 * Public, unauthenticated. Returns the invoice + company branding the
 * /pay/i/[token] page renders.
 *
 * Why this exists: migration 20260521090000 dropped the open
 * `anon_read_invoice_by_token` RLS policy (it had no token check - a
 * cross-tenant leak), asserting "no app code depends on direct anon
 * SELECT against these tables". That was wrong twice over:
 * /pay/i/[token].tsx selected invoices directly with the anon key
 * (silently empty after the drop -> every public pay link rendered
 * "Invoice not found"), and its company embed asked for a
 * `phone_number` column that doesn't exist on companies (the column
 * is `phone`), which 400'd the query anyway.
 *
 * Same shape as /api/public/quotes/[token]/get: service-role SELECT,
 * token-in-WHERE as the access secret, rate-limited per IP.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false, error: "Not found" });

  const supabase = getServiceSupabase() as any;

  // Liberal limit - the pay page reloads on payment-return redirects.
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 120,
    bucket: "hour",
  });
  if (!rl.allowed) return res.status(429).json({ ok: false, error: "Too many requests" });

  // Service-role SELECT bypasses RLS; the unguessable public_token in
  // the WHERE clause is the access secret. `phone_number:phone` keeps
  // the page's existing InvoiceView shape while reading the real
  // column name.
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, public_token, invoice_number, invoice_date, due_date,
      total_amount, amount_paid, balance_due, status, invoice_data,
      companies:company_id (
        id, company_name, logo_url, email, phone_number:phone,
        vat_registered, vat_number, vat_rate, deposit_percent,
        primary_color, secondary_color, accent_color
      )
    `)
    .eq("public_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[public/invoices/get] fetch failed:", error);
    return res.status(500).json({ ok: false, error: "Lookup failed" });
  }

  if (!data) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  return res.status(200).json({ ok: true, invoice: data });
}

export default withApiLogging(handler);
