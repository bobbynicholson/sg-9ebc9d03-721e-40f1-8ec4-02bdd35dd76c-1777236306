/**
 * Returns the order view using the cms_client_token_<order_id> cookie
 * set by /api/client-tokens/validate. Used on page refresh / direct
 * revisit, so the raw token is only ever in the URL on the very first
 * click.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
  const orderId = String(body.order_id || "").trim();
  if (!orderId) return res.status(400).json({ error: "order_id required" });

  const cookieName = `cms_client_token_${orderId}`;
  // Either the per-order cookie OR the account-scope magic-link cookie is
  // enough -- the RPC will verify the account-scope cookie's email matches
  // this order's client_email before unlocking.
  const tokenHash = (
    req.cookies?.[cookieName] ||
    req.cookies?.cms_client_account_token ||
    ""
  ).trim();
  if (!tokenHash) return res.status(401).json({ error: "no_cookie" });

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ error: "Server misconfigured" });
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.socket as any)?.remoteAddress ||
    null;
  const ua = (req.headers["user-agent"] as string) || null;

  const { data, error } = await client.rpc("client_view_order", {
    p_token_hash: tokenHash,
    p_order_id:   orderId,
    p_ip:         ip,
    p_user_agent: ua,
  });

  if (error) return res.status(500).json({ error: "Lookup failed" });
  const result = data as any;
  if (!result?.ok) {
    // Clear stale cookie
    res.setHeader("Set-Cookie", `${cookieName}=; Max-Age=0; Path=/`);
    return res.status(401).json({ error: result?.code || "invalid" });
  }
  return res.status(200).json(result);
}
