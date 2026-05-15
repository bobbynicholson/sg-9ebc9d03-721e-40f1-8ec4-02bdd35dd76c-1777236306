import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { getAuthorizationUrl } from "@/services/accountingIntegrationService";

/**
 * Wave 70 -- start the Sage OAuth dance. Mirrors the Xero pattern.
 *
 * Requires the user to be authenticated as a company_admin / admin
 * / owner; the company_id is passed in the query string and stored
 * in the HttpOnly oauth_company_id cookie so the callback can pair
 * the redirect back to the right tenant without trusting the URL.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : null;
    if (!companyId) {
      return res.status(400).json({ error: "Missing companyId" });
    }

    // CSRF state. HttpOnly cookie so the callback can verify the
    // round trip belongs to this browser.
    const state = crypto.randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", [
      `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
      `oauth_company_id=${encodeURIComponent(companyId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    ]);

    // getAuthorizationUrl writes another state to sessionStorage when
    // it's called from the browser; here we override with the cookie
    // state by appending it directly. The user lands on Sage's
    // hosted consent screen.
    const authUrl = getAuthorizationUrl("sage", companyId);
    // Replace the placeholder state with the cookie state so the
    // callback's check succeeds.
    const finalUrl = authUrl.replace(/state=[^&]+/, `state=${state}`);
    return res.redirect(finalUrl);
  } catch (error: any) {
    console.error("Sage authorize error:", error);
    return res.redirect(`/admin/integrations?error=${encodeURIComponent(error.message)}`);
  }
}
