import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getIntegrationStatus, getValidAccessToken } from "@/services/accountingIntegrationService";
import { effectiveProfileRole } from "@/lib/roleDerivation";
import { withApiLogging } from "@/lib/withApiLogging";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });

  const { data: profile } = await ssr
    .from("profiles")
    .select("role, active_role, company_id, is_active, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false || profile.deleted_at) {
    return res.status(403).json({ error: "Account access denied" });
  }
  if (!ALLOWED_ROLES.has(effectiveProfileRole(profile))) {
    return res.status(403).json({ error: "Owner or admin only" });
  }
  if (!profile.company_id) return res.status(403).json({ error: "Company access required" });

  const integrations: Record<string, { connected: boolean; reconnectNeeded: boolean }> = {};
  for (const provider of ["xero", "quickbooks"] as const) {
    const status = await getIntegrationStatus(profile.company_id, provider);
    const token = status.connected
      ? await getValidAccessToken(profile.company_id, provider)
      : null;
    integrations[provider] = {
      connected: status.connected,
      reconnectNeeded: !!status.connected && !token?.success,
    };
  }
  return res.status(200).json({ integrations });
}

export default withApiLogging(handler);
