/**
 * Validate a magic-link (scope=client) token and return every order
 * tied to that email under the catering company.
 *
 * Same shape as /api/client-tokens/validate - accepts either a fresh
 * `?t=...` query token or the cookie set on first visit.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { consumeApiKeyRateLimitDb } from "@/lib/apiKeyRateLimit";
import { withApiLogging } from "@/lib/withApiLogging";


const sha256Hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
  const rawToken = String(body.token || "").trim();
  // TIGHTEN I.122 (mirrors validate.ts): the browser is on the slug-
  // prefixed URL (/{slug}/c/account), so the cookie Path must include the
  // slug or it won't ship on revisits. Caller passes the slug from
  // router.query.company_slug.
  const rawSlug = String(body.slug || "").trim().toLowerCase();
  const cleanSlug = /^[a-z0-9][a-z0-9-]{0,63}$/.test(rawSlug) ? rawSlug : "";

  let tokenHash = "";
  if (rawToken) {
    tokenHash = sha256Hex(rawToken);
  } else {
    tokenHash = (req.cookies?.cms_client_account_token || "").trim();
  }
  if (!tokenHash) return res.status(401).json({ error: "no_token" });

  // Wave 24: rate-limit per IP to slow brute-force token enumeration
  // against the account-scope magic-link surface. 30 attempts/min/IP
  // is generous for legitimate "open email link" flows (which fire
  // once per visit). The cookie-only path still hits the limiter so
  // a stolen cookie can't be used as a probe oracle either.
  const rlIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.socket as any)?.remoteAddress ||
    "unknown";
  const rlKey = sha256Hex(`client-account-token:${rlIp}`);
  try {
    const rl = await consumeApiKeyRateLimitDb(getServiceSupabase(), rlKey, {
      maxPerMinute: 30,
    });
    if (!rl.allowed) {
      return res.status(429).json({ error: "Too many attempts, please slow down" });
    }
  } catch {
    // Limiter init failure shouldn't block legitimate traffic.
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ error: "Server misconfigured" });
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.socket as any)?.remoteAddress ||
    null;
  const ua = (req.headers["user-agent"] as string) || null;

  const { data, error } = await client.rpc("client_view_account", {
    p_token_hash: tokenHash,
    p_ip: ip,
    p_user_agent: ua,
  });

  if (error) return res.status(500).json({ error: "Lookup failed" });
  const result = data as any;
  if (!result?.ok) {
    if (rawToken) {
      // Fresh token but invalid - don't set a cookie
    } else {
      // Cookie was bad - clear it. Send on every path it could have been
      // set under: the slug path (current prod), /c (canonical), and /
      // (legacy pre-narrowing cookies).
      const clearCookies = [
        `cms_client_account_token=; Max-Age=0; Path=/c`,
        `cms_client_account_token=; Max-Age=0; Path=/`,
      ];
      if (cleanSlug) clearCookies.unshift(`cms_client_account_token=; Max-Age=0; Path=/${cleanSlug}/c`);
      res.setHeader("Set-Cookie", clearCookies);
    }
    return res.status(401).json({ error: result?.code || "invalid" });
  }

  // First-visit: set cookie so refresh works without the token in URL
  if (rawToken) {
    const expiresAt = new Date(result.token.expires_at);
    const maxAgeSec = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    // Path=/c narrows the cookie to tokenised client surfaces only
    // (the /c/* tree). Previously Path=/ shipped this cookie on
    // every request including /admin and /api routes that don't
    // need it, widening the exposure surface unnecessarily.
    // On slug-prefixed prod URLs we ALSO set /{slug}/c (mirrors
    // validate.ts) so the cookie ships on subsequent visits to the
    // branded URL, not just the canonical one.
    const maxAge = Math.min(maxAgeSec, 60 * 60 * 24 * 180);
    const cookiePaths: string[] = ["/c"];
    if (cleanSlug) cookiePaths.unshift(`/${cleanSlug}/c`);
    const cookies = cookiePaths.map((path) =>
      [
        `cms_client_account_token=${tokenHash}`,
        `Max-Age=${maxAge}`,
        `Path=${path}`,
        "HttpOnly",
        "SameSite=Lax",
        "Secure",
      ].join("; "),
    );
    res.setHeader("Set-Cookie", cookies);
  }
  return res.status(200).json(result);
}

export default withApiLogging(handler);
