/**
 * GET /api/accounting/xero/authorize
 *
 * Server-side OAuth initiator. Phase 1 P0-06 closed the callback hole
 * by requiring an HttpOnly oauth_state cookie that matches the state
 * query param. Without a server-side initiator that SETS the cookie,
 * the OAuth flow fails closed (correct, but the operator can't actually
 * connect Xero). This endpoint mints state + sets the cookies + sends
 * the operator to Xero's authorise URL.
 *
 * Auth: company_admin / admin / owner / super_admin in the same
 * company.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });

  const { data: profile } = await ssr
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", user.id)
    .maybeSingle();
  const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
  if (!ALLOWED_ROLES.has(role)) {
    return res.status(403).json({ error: "Owner or admin only" });
  }

  const callerCompanyId = (profile as any)?.company_id as string | undefined;
  // Allow super_admin to authorise on behalf of a different tenant via
  // ?company_id= query param; default to the caller's own.
  const targetCompanyId = (
    (typeof req.query.company_id === "string" && req.query.company_id) ||
    callerCompanyId ||
    ""
  );
  if (!targetCompanyId) {
    return res.status(400).json({ error: "Missing company context" });
  }
  if (role !== "super_admin" && targetCompanyId !== callerCompanyId) {
    return res.status(403).json({ error: "Cannot authorise for another company" });
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI
    || (process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/accounting/xero/callback`
        : null);

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: "Xero integration not configured. Set XERO_CLIENT_ID and XERO_REDIRECT_URI on Vercel.",
    });
  }

  const state = crypto.randomBytes(24).toString("hex");

  // HttpOnly cookies, 10-minute lifetime so a stale flow can't be
  // resumed days later. SameSite=Lax so the redirect from Xero brings
  // them back. Path=/api/accounting so they don't leak to other parts
  // of the site.
  const cookieAttrs = "Path=/api/accounting; HttpOnly; SameSite=Lax; Max-Age=600";
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `oauth_state=${state}${secure}; ${cookieAttrs}`,
    `oauth_company_id=${targetCompanyId}${secure}; ${cookieAttrs}`,
  ]);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email accounting.transactions accounting.contacts offline_access",
    state,
  });

  return res.redirect(302, `https://login.xero.com/identity/connect/authorize?${params.toString()}`);
}
