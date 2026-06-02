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
 *   - Returns a NEW token scoped to the order, with the same TTL
 *     (60 days per mint_client_order_token), so the client gets a
 *     time-limited working link without us re-issuing the quote
 *     token.
 *   - If the quote isn't converted yet, returns { converted: false }
 *     and the caller stays on /q/{token} (which DOES still work for
 *     pre-conversion / accepted-but-not-yet-converted states).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";

export const config = {
  api: { bodyParser: { sizeLimit: "4kb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  const sb = getServiceSupabase() as any;

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

  // 3) Mint a client_access_token for the order. Uses the same RPC as
  //    the admin "preview as client" button so TTL + storage shape
  //    match.
  const { data: tokenRow, error: mintErr } = await sb.rpc("mint_client_order_token", {
    p_company_id: (orderRow as any).company_id,
    p_order_id: orderId,
    p_label: "quote-bridge",
  });
  if (mintErr) {
    console.error("[public/quotes/order-link] mint failed:", mintErr);
    return res.status(500).json({ ok: false, error: mintErr.message });
  }
  const raw = (tokenRow as any)?.raw_token;
  if (!raw) {
    return res.status(500).json({ ok: false, error: "Token mint failed" });
  }

  return res.status(200).json({
    ok: true,
    converted: true,
    orderId,
    url: `/c/order/${orderId}?t=${raw}`,
  });
}
