import type { NextApiRequest, NextApiResponse } from "next";
import {
  exchangeCodeForTokens,
  storeOAuthTokens,
} from "@/services/accountingIntegrationService";
import { withApiLogging } from "@/lib/withApiLogging";


/**
 * Wave 70 - Sage Business Cloud OAuth callback.
 *
 * Mirrors the Xero callback pattern: state cookie CSRF check,
 * single-use clear, exchange + store, redirect back to integrations.
 *
 * To go live, set in Vercel + .env.local:
 *   NEXT_PUBLIC_SAGE_CLIENT_ID
 *   SAGE_CLIENT_SECRET
 * And add the callback URL
 *   https://yourdomain.com/api/accounting/sage/callback
 * to the Sage developer console app whitelist.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const { code, state } = req.query;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    const stateCookie = req.cookies.oauth_state;
    const companyId = req.cookies.oauth_company_id;
    if (!stateCookie || !state || typeof state !== "string" || stateCookie !== state) {
      return res.status(400).json({
        error: "OAuth state mismatch. Restart the integration flow from /admin/integrations.",
      });
    }
    if (!companyId) {
      return res.status(400).json({ error: "Missing company context" });
    }

    res.setHeader("Set-Cookie", [
      "oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      "oauth_company_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    ]);

    const tokenResult = await exchangeCodeForTokens("sage", code);
    if (!tokenResult.success || !tokenResult.tokens) {
      return res.redirect(
        `/admin/integrations?error=${encodeURIComponent(tokenResult.error || "Token exchange failed")}`,
      );
    }

    const storeResult = await storeOAuthTokens(companyId, "sage", tokenResult.tokens);
    if (!storeResult.success) {
      return res.redirect(
        `/admin/integrations?error=${encodeURIComponent(storeResult.error || "Failed to store tokens")}`,
      );
    }

    return res.redirect("/admin/integrations?success=sage_connected");
  } catch (error: any) {
    console.error("Sage callback error:", error);
    return res.redirect(`/admin/integrations?error=${encodeURIComponent(error.message)}`);
  }
}

export default withApiLogging(handler);
