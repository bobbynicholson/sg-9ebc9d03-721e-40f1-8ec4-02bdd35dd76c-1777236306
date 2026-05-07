import type { NextApiRequest, NextApiResponse } from "next";
import { 
  exchangeCodeForTokens, 
  storeOAuthTokens 
} from "@/services/accountingIntegrationService";

/**
 * QuickBooks OAuth Callback Handler
 * Receives authorization code and exchanges for tokens
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { code, state, realmId } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    // CSRF protection: state must match the HttpOnly cookie issued at
    // flow start, alongside the target company_id [P0-06].
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
    const tokenResult = await exchangeCodeForTokens("quickbooks", code);
    
    if (!tokenResult.success || !tokenResult.tokens) {
      return res.redirect(`/admin/integrations?error=${encodeURIComponent(tokenResult.error || "Token exchange failed")}`);
    }

    // QuickBooks sends realmId in callback
    if (realmId && typeof realmId === "string") {
      tokenResult.tokens.tenant_id = realmId;
    }

    // Store tokens
    const storeResult = await storeOAuthTokens(companyId, "quickbooks", tokenResult.tokens);
    
    if (!storeResult.success) {
      return res.redirect(`/admin/integrations?error=${encodeURIComponent(storeResult.error || "Failed to store tokens")}`);
    }

    // Redirect to success page
    return res.redirect("/admin/integrations?success=quickbooks_connected");
  } catch (error: any) {
    console.error("QuickBooks callback error:", error);
    return res.redirect(`/admin/integrations?error=${encodeURIComponent(error.message)}`);
  }
}