import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { effectiveProfileRole } from "@/lib/roleDerivation";
import { getAuthorizationUrl } from "@/services/accountingIntegrationService";
import { withApiLogging } from "@/lib/withApiLogging";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/**
 * Wave 70 - start the Sage OAuth dance. Mirrors the Xero pattern.
 *
 * Requires the user to be authenticated as a company_admin / admin
 * / owner; the company_id is passed in the query string and stored
 * in the HttpOnly oauth_company_id cookie so the callback can pair
 * the redirect back to the right tenant without trusting the URL.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileError } = await ssr
      .from("profiles")
      .select("role, active_role, company_id, is_active, deleted_at")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error("[accounting/sage/authorize] profile lookup failed");
      return res.status(500).json({ error: "Could not verify account access" });
    }
    if (!profile || profile.is_active === false || profile.deleted_at) {
      return res.status(403).json({ error: "Account access denied" });
    }

    const role = effectiveProfileRole(profile);
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Owner or admin only" });

    const callerCompanyId = profile.company_id || "";
    const requestedCompanyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
    const companyId = requestedCompanyId || callerCompanyId;
    if (!companyId || !UUID_RE.test(companyId)) {
      return res.status(400).json({ error: "A valid companyId is required" });
    }
    if (role !== "super_admin" && companyId !== callerCompanyId) {
      return res.status(403).json({ error: "Cannot authorise for another company" });
    }
    if (role === "super_admin") {
      const { data: company, error: companyError } = await getServiceSupabase()
        .from("companies")
        .select("id")
        .eq("id", companyId)
        .maybeSingle();
      if (companyError) {
        console.error("[accounting/sage/authorize] company lookup failed");
        return res.status(500).json({ error: "Could not verify company" });
      }
      if (!company) return res.status(404).json({ error: "Company not found" });
    }

    if (!process.env.NEXT_PUBLIC_SAGE_CLIENT_ID || !process.env.NEXT_PUBLIC_APP_URL) {
      return res.status(503).json({ error: "Sage integration is not configured" });
    }

    // CSRF state. HttpOnly cookie so the callback can verify the
    // round trip belongs to this browser.
    const state = crypto.randomBytes(24).toString("hex");
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", [
      `oauth_state=${state}${secure}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
      `oauth_company_id=${encodeURIComponent(companyId)}${secure}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
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
    console.error("[accounting/sage/authorize] request failed");
    return res.redirect(`/admin/integrations?error=${encodeURIComponent("Could not start Sage authorization. Please retry.")}`);
  }
}

export default withApiLogging(handler);
