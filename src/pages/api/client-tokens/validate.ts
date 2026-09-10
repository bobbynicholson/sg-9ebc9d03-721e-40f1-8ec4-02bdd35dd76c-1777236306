/**
 * Validate a client access token and (if valid) set a short-lived
 * cookie carrying the SHA-256 of the token. The /c/order/[id] page
 * uses the cookie on subsequent visits so the raw token doesn't sit
 * in URLs / browser history / referrer headers.
 *
 * Cookie name:  cms_client_token_<order_id>
 * Cookie body:  <hex hash of raw token>
 * Cookie life:  matches token expires_at, capped at 60 days
 *
 * Anyone can call this - the token is the auth.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { consumeApiKeyRateLimitDb } from "@/lib/apiKeyRateLimit";
import { withApiLogging } from "@/lib/withApiLogging";


const sha256Hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
  const orderId  = String(body.order_id || "").trim();
  const rawToken = String(body.token    || "").trim();
  // TIGHTEN I.122 (2026-06-03): caller passes the slug from the browser
  // URL so the cookie Path matches. Cookies are scoped to the URL the
  // browser actually sees (slug-prefixed), not the canonical Next path.
  // We sanitise to a single segment of [a-z0-9-] so a hostile body can't
  // smuggle in a different path through this field.
  const rawSlug = String(body.slug || "").trim().toLowerCase();
  const cleanSlug = /^[a-z0-9][a-z0-9-]{0,63}$/.test(rawSlug) ? rawSlug : "";
  if (!orderId || !rawToken) {
    return res.status(400).json({ error: "order_id and token required" });
  }

  // Wave 24: rate-limit per (IP, order_id) to slow brute-force token
  // enumeration. Tokens are 256-bit so the search space is huge, but
  // an unlimited endpoint still lets an attacker probe at line rate
  // for free. 30 attempts/min/IP/order is generous for the legitimate
  // "click email link, page mounts, calls validate" flow (which fires
  // once per visit). Falls back to in-memory limiter on RPC error.
  const rlIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.socket as any)?.remoteAddress ||
    "unknown";
  const rlKey = sha256Hex(`client-token-validate:${rlIp}:${orderId}`);
  try {
    const rl = await consumeApiKeyRateLimitDb(getServiceSupabase(), rlKey, {
      maxPerMinute: 30,
    });
    if (!rl.allowed) {
      return res.status(429).json({ error: "Too many attempts, please slow down" });
    }
  } catch {
    // Limiter init failure shouldn't block legitimate traffic --
    // consumeApiKeyRateLimitDb already has its own in-memory fallback.
  }

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ error: "Server misconfigured" });
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const tokenHash = sha256Hex(rawToken);
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

  if (error) {
    // Surface the real Postgres error (code + message) so a broken RPC -
    // e.g. schema drift where the function body references a column the
    // live table doesn't have - is diagnosable from the client instead
    // of hiding behind a generic "Lookup failed". The token is the auth
    // and these are schema diagnostics, not secrets.
    console.error("client_view_order failed:", error);
    return res.status(500).json({
      error: "Lookup failed",
      detail: (error as any)?.message || null,
      code: (error as any)?.code || null,
    });
  }
  const result = data as any;
  if (!result?.ok) {
    return res.status(401).json({ error: result?.code || "invalid" });
  }

  // Set a cookie so the page doesn't have to keep the token in the URL.
  // Path=/c narrows the cookie to the tokenised client surfaces only
  // (the /c/* tree), so it never ships on /api/*, /admin/*, or the
  // tenant pages where it has no business going. Previously Path=/
  // sent this cookie on every request including admin pages, which
  // gave network sniffers a much larger exposure window than needed.
  const expiresAt = new Date(result.token.expires_at);
  const maxAgeSec = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  // TIGHTEN I.122: when the URL is slug-prefixed (every production
  // path that goes through the tenant rewrite chain) the cookie Path
  // must include the slug or the browser won't ship the cookie on
  // subsequent /view requests from the same URL. Set TWO cookies -
  // one at /{slug}/c and one at /c - so the page works whether the
  // user lands on the slugged URL or the canonical one. Cookie name
  // is per-order so the overlap is harmless.
  //
  // Wave 33 bugfix: the /c (page) paths alone are NOT enough. The
  // amend / cancel / postpone / view actions fetch the root-absolute
  // path /api/client-tokens/* (a relative fetch from a slugged page
  // resolves to the site root, never the slug), and a cookie scoped to
  // /c does NOT match /api/* - so the browser withheld the token and
  // every "Request a change" / "Cancel this order" POST came back 401
  // "Open the order link from your email first". Add an explicit
  // Path=/api/client-tokens cookie so the token ships on exactly those
  // four endpoints and nothing else (still off /admin/*, /api/orders/*,
  // and the tenant pages - the original narrowing intent is intact).
  const cookiePaths: string[] = ["/c", "/api/client-tokens"];
  if (cleanSlug) cookiePaths.unshift(`/${cleanSlug}/c`);
  const cookieHeaders = cookiePaths.map((path) =>
    [
      `cms_client_token_${orderId}=${tokenHash}`,
      `Max-Age=${Math.min(maxAgeSec, 60 * 60 * 24 * 60)}`,
      `Path=${path}`,
      "HttpOnly",
      "SameSite=Lax",
      "Secure",
    ].join("; "),
  );
  res.setHeader("Set-Cookie", cookieHeaders);

  return res.status(200).json(result);
}

export default withApiLogging(handler);
