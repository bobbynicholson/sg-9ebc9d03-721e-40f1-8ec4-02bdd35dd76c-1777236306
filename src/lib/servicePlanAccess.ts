import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const SERVICE_PLAN_ADMIN_ROLES = new Set(["super_admin", "owner", "company_admin", "admin", "region_admin", "sales_admin"]);

export async function servicePlanAccess(req: NextApiRequest, res: NextApiResponse) {
  const client = createPagesServerClient({ req, res });
  const { data: { user } } = await client.auth.getUser();
  if (!user) { res.status(401).json({ error: "Please sign in again." }); return null; }
  const db = getServiceSupabase() as any;
  const { data: profile, error } = await db.from("profiles").select("company_id,role,active_role").eq("id", user.id).maybeSingle();
  if (error || !profile?.company_id) { res.status(403).json({ error: "Your company access could not be verified." }); return null; }
  return { db, userId: user.id, companyId: profile.company_id as string, isAdmin: SERVICE_PLAN_ADMIN_ROLES.has(profile.active_role || profile.role) };
}
