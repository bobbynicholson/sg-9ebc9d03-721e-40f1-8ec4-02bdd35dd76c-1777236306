/**
 * TIGHTEN I.113 (2026-06-02): bridge from /q/{token} to /c/order/{id}
 * once a quote has been converted to an order.
 *
 * Public, unauthenticated. The original email link the client clicked
 * was /q/{token}. After the quote was accepted + converted, that URL
 * should bridge them to the live order view (current status, invoice,
 * tracking timeline) - the frozen quote celebration page can't do
 * that. We mint a fresh client_access_token (same RPC the admin
 * "Client view" button uses) and return the polished
 * /c/order/{id}?t=... URL.
 *
 * Why this is safe to be public:
 *   - Caller already holds the quote's public_token (random UUID) -
 *     same secret the /q/{token} accept route trusts.
 *   - Returns a NEW token scoped to the order, with a SHORT 24-hour
 *     TTL (TIGHTEN I.123). The quote's permanent public_token in the
 *     client's inbox always re-mints fresh on every click, so a
 *     24-hour cookie life is enough for one session of use. Anything
 *     older has to come through the email link again (canonical
 *     path) or the magic-link recovery card (explanation included).
 *   - If the quote isn't converted yet, returns { converted: false }
 *     and the caller stays on /q/{token} (which DOES still work for
 *     pre-conversion / accepted-but-not-yet-converted states).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getRequestSupabase } from "@/lib/supabase/service";
import {
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";


export const config = {
  api: { bodyParser: { sizeLimit: "4kb" } },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  const sb = await getRequestSupabase() as any;

  // Same rate limit as the other public quote routes (5/hr per
  // IP+token). The endpoint is cheap but minting tokens isn't free.
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const rl = await checkAndIncrementRateLimit(token, ipHash, sb, {
    limit: 20,
    bucket: "hour",
  });
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: "Too many attempts" });
  }

  // 1) Look up the quote by its public_token. Need company_id +
  //    converted_to_order_id.
  const { data: quoteRow, error: qErr } = await sb
    .from("quotes")
    .select("id, company_id, converted_to_order_id, deleted_at")
    .eq("public_token", token)
    .maybeSingle();
  if (qErr) {
    console.error("[public/quotes/order-link] quote lookup failed:", qErr);
    return res.status(500).json({ ok: false, error: "Lookup failed" });
  }
  if (!quoteRow || (quoteRow as any).deleted_at) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  const orderId = (quoteRow as any).converted_to_order_id as string | null;
  if (!orderId) {
    // Quote isn't converted yet - caller stays on /q/{token}, which is
    // the right page for a pre-conversion quote.
    return res.status(200).json({ ok: true, converted: false });
  }

  // 2) Verify the order exists + isn't soft-deleted.
  const { data: orderRow, error: oErr } = await sb
    .from("orders")
    .select("id, company_id, deleted_at")
    .eq("id", orderId)
    .maybeSingle();
  if (oErr) {
    console.error("[public/quotes/order-link] order lookup failed:", oErr);
    return res.status(500).json({ ok: false, error: "Lookup failed" });
  }
  if (!orderRow || (orderRow as any).deleted_at) {
    // Order was deleted - stay on /q/{token}.
    return res.status(200).json({ ok: true, converted: false });
  }

  // TIGHTEN I.115: resolve the tenant slug so the bridge URL is
  // /{slug}/c/order/{id}?t=... - routes through the tenant rewrite
  // chain like every other customer-facing URL.
  const { data: companyRow } = await sb
    .from("companies")
    .select("slug")
    .eq("id", (orderRow as any).company_id)
    .maybeSingle();
  const slug = (companyRow as any)?.slug
    ? String((companyRow as any).slug).trim()
    : null;

  // 3) Mint a client_access_token for the order. TIGHTEN I.123: pass
  //    p_ttl_hours=24 so the cookie set by /validate downstream only
  //    lasts a day. The quote's public_token in the client's inbox is
  //    permanent and always re-mints on click, so we don't need long-
  //    lived bridge tokens - they're just session cookies.
  const { data: tokenRow, error: mintErr } = await sb.rpc("mint_client_order_token", {
    p_company_id: (orderRow as any).company_id,
    p_order_id: orderId,
    p_label: "quote-bridge",
    p_ttl_hours: 24,
  });
  if (mintErr) {
    console.error("[public/quotes/order-link] mint failed:", mintErr);
    return res.status(500).json({ ok: false, error: mintErr.message });
  }
  const raw = (tokenRow as any)?.raw_token;
  if (!raw) {
    return res.status(500).json({ ok: false, error: "Token mint failed" });
  }

  const slugSeg = slug ? `/${slug.replace(/^\/+|\/+$/g, "")}` : "";
  return res.status(200).json({
    ok: true,
    converted: true,
    orderId,
    url: `${slugSeg}/c/order/${orderId}?t=${raw}`,
  });
}

export default withApiLogging(handler);
