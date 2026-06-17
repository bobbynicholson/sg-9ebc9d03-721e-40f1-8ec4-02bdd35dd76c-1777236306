/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TIGHTEN I.116 (2026-06-02): GET /api/public/quotes/[token]/get
 *
 * Public, unauthenticated. Returns the full PublicQuoteView shape for
 * the polished /q/[token] page to render.
 *
 * Why this exists: a previous audit dropped the open
 * `anon_read_quote_by_token` RLS policy on quotes (migration
 * 20260521090000) because it had no token-presence check and let anon
 * read everything. The migration's "no app code depends on this"
 * justification was incorrect - /q/[token] was calling supabase-js
 * with the anon key directly via publicQuoteService.fetchByToken,
 * which silently returned null and rendered "Quote not found".
 *
 * The right fix is service-role + token verification (the pattern the
 * migration's docstring described). This endpoint implements that.
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
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false, error: "Not found" });

  const supabase = getServiceSupabase() as any;

  // Liberal rate limit - polished /q page may reload a few times for
  // a single client session. 120/hr/ip is plenty for legit use, blocks
  // scraping of leaked tokens.
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 120,
    bucket: "hour",
  });
  if (!rl.allowed) return res.status(429).json({ ok: false, error: "Too many requests" });

  // Service-role SELECT bypasses RLS. The token-in-WHERE acts as the
  // access secret (UUID, cryptographically random, only the original
  // recipient should have it).
  const { data, error } = await supabase
    .from("quotes")
    .select(`
      id, quote_number, quote_name, client_name, event_date, event_time, setup_time, guest_count,
      venue_address, menu_items, equipment_items, notes, terms_and_conditions,
      subtotal, tax_amount, discount_amount, total, total_amount, status,
      deposit_percentage,
      delivery_fee, delivery_distance_km, delivery_rate_per_km,
      valid_until, sent_at, viewed_at, accepted_at,
      converted_to_order_id,
      company:company_id (
        id, company_name, logo_url, email, phone, website,
        address_line1, address_line2, city,
        vat_registered, vat_number, vat_rate, pricing_includes_vat,
        registration_number, tax_number,
        primary_color, secondary_color, accent_color,
        currency, deposit_percent
      )
    `)
    .eq("public_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[public/quotes/get] fetch failed:", error);
    return res.status(500).json({ ok: false, error: "Lookup failed" });
  }

  if (!data) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  // Resolve the deposit % the same way the admin accept dialog does
  // (resolveDepositPct in admin/quotes): prefer the company's CURRENT
  // Settings -> Financial value over the quote's stamped deposit_percentage,
  // which is frozen at creation time (older quotes carry the old hardcoded
  // 30). Otherwise a tenant who set 50% in settings still saw 30% on the
  // client-facing /q page. We overwrite the returned deposit_percentage so
  // the page binding (quote.deposit_percentage) needs no change.
  const companyPct = Number((data as any)?.company?.deposit_percent);
  const quotePct = Number((data as any)?.deposit_percentage);
  const effectivePct =
    Number.isFinite(companyPct) && companyPct > 0
      ? companyPct
      : Number.isFinite(quotePct) && quotePct > 0
        ? quotePct
        : null;
  (data as any).deposit_percentage = effectivePct;

  return res.status(200).json({ ok: true, quote: data });
}

export default withApiLogging(handler);
