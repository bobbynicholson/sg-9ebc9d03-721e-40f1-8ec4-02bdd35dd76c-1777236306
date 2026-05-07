/**
 * GET /api/accounting/quickbooks/authorize
 *
 * Server-side OAuth initiator for QuickBooks. Mirror of the Xero
 * initiator (P2F-5). Sets HttpOnly oauth_state + oauth_company_id
 * cookies that the callback (P0-06) requires.
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

  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI
    || (process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/accounting/quickbooks/callback`
        : null);

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: "QuickBooks integration not configured. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_REDIRECT_URI on Vercel.",
    });
  }

  const state = crypto.randomBytes(24).toString("hex");
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
    scope: "com.intuit.quickbooks.accounting",
    state,
  });

  return res.redirect(302, `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`);
}
