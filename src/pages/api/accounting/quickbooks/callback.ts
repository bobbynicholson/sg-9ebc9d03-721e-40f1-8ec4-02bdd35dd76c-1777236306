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

    // TODO: Validate state for CSRF protection
    const companyId = req.cookies.oauth_company_id;
    
    if (!companyId) {
      return res.status(400).json({ error: "Missing company context" });
    }

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