import type { NextApiRequest, NextApiResponse } from "next";
import { 
  exchangeCodeForTokens, 
  storeOAuthTokens 
} from "@/services/accountingIntegrationService";
import { withApiLogging } from "@/lib/withApiLogging";


/**
 * Xero OAuth Callback Handler
 * Receives authorization code and exchanges for tokens
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    // CSRF protection: state from the auth-server response must match
    // the state issued at flow start, which is stored in an HttpOnly
    // cookie alongside the target company_id [P0-06]. Without this
    // check, any third party could complete the OAuth handshake against
    // a different victim's tenant by linking back to this URL.
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

    // Single-use: clear the state cookie immediately so a replay can't
    // re-bind the same code to a different tenant.
    res.setHeader("Set-Cookie", [
      "oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      "oauth_company_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    ]);

    // Exchange code for tokens
    const tokenResult = await exchangeCodeForTokens("xero", code);
    
    if (!tokenResult.success || !tokenResult.tokens) {
      return res.redirect(`/admin/integrations?error=${encodeURIComponent(tokenResult.error || "Token exchange failed")}`);
    }

    // Store tokens
    const storeResult = await storeOAuthTokens(companyId, "xero", tokenResult.tokens);
    
    if (!storeResult.success) {
      return res.redirect(`/admin/integrations?error=${encodeURIComponent(storeResult.error || "Failed to store tokens")}`);
    }

    // Redirect to success page
    return res.redirect("/admin/integrations?success=xero_connected");
  } catch (error: any) {
    console.error("Xero callback error:", error);
    return res.redirect(`/admin/integrations?error=${encodeURIComponent(error.message)}`);
  }
}

export default withApiLogging(handler);
