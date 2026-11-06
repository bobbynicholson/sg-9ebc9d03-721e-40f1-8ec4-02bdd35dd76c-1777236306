/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

/** The company an admin is working in, or null after sending the error. */
export async function companyForAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<{ companyId: string; userId: string } | null> {
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  const { data: profile } = await ssr.from("profiles").select("role, active_role, company_id").eq("id", user.id).maybeSingle();
  const role = String((profile as any)?.active_role || (profile as any)?.role || "");
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ error: "Only company admins can manage WhatsApp." });
    return null;
  }
  // The platform owner works inside whichever company they have opened.
  const requested = String(req.query.companyId || "");
  const companyId = role === "super_admin" && requested ? requested : String((profile as any)?.company_id || "");
  if (!companyId) {
    res.status(400).json({ error: "Open a company first." });
    return null;
  }
  return { companyId, userId: user.id };
}
