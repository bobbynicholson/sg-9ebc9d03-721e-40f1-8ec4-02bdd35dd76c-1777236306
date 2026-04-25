import type { NextApiRequest, NextApiResponse } from "next";
import { 
  exchangeCodeForTokens, 
  storeOAuthTokens 
} from "@/services/accountingIntegrationService";

/**
 * Xero OAuth Callback Handler
 * Receives authorization code and exchanges for tokens
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    // TODO: Validate state for CSRF protection
    // For now, get company ID from session/cookie
    const companyId = req.cookies.oauth_company_id;
    
    if (!companyId) {
      return res.status(400).json({ error: "Missing company context" });
    }

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