import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

/**
 * Privileged service-role calls bypass RLS, so verify account status from a
 * fresh profile lookup on every request, even when the Auth session is valid.
 * A selected portal role never grants extra permissions.
 */
export async function requireActiveApiProfile(
  req: NextApiRequest,
  res: NextApiResponse,
  allowedRoles: ReadonlySet<string>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const client = createPagesServerClient({ req, res });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  const { data: profile, error } = await client.from("profiles")
    .select("role, company_id, is_active, deleted_at").eq("id", user.id).maybeSingle();
  if (error) {
    console.error("[requireActiveApiProfile] permission lookup failed:", error);
    res.status(503).json({ error: "Could not verify account permission" });
    return null;
  }
  if (!profile || profile.is_active === false || profile.deleted_at) {
    res.status(403).json({ error: "Account access denied", code: "ACCOUNT_ACCESS_DENIED" });
    return null;
  }
  const role = String(profile.role || "");
  if (!allowedRoles.has(role)) {
    res.status(403).json({ error: "Admin or owner only" });
    return null;
  }
  return { user, profile, role };
}
