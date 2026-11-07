import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const companyId = typeof req.body?.companyId === "string" ? req.body.companyId : "";
  const isActive = req.body?.isActive;
  if (!UUID_RE.test(companyId) || typeof isActive !== "boolean") {
    return res.status(400).json({ error: "A valid companyId and boolean isActive value are required." });
  }

  try {
    const sessionClient = createPagesServerClient({ req, res });
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in again and retry." });

    const { data: caller, error: callerError } = await sessionClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (callerError || caller?.role !== "super_admin") {
      return res.status(403).json({ error: "Only platform owners can change company workspace access." });
    }

    const admin = getServiceSupabase();
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, company_name, is_active")
      .eq("id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (companyError) return res.status(500).json({ error: dbErrorMessage(companyError, { entity: "company" }) });
    if (!company) return res.status(404).json({ error: "Company not found." });

    if (!isActive) {
      const { data: callerMembership, error: membershipError } = await admin
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (membershipError) return res.status(500).json({ error: dbErrorMessage(membershipError, { entity: "company users" }) });
      if (callerMembership) {
        return res.status(400).json({ error: "You cannot deactivate the company that contains your platform owner account." });
      }
    }

    const { data: updatedCompany, error: updateError } = await admin
      .from("companies")
      .update({ is_active: isActive })
      .eq("id", companyId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) return res.status(500).json({ error: dbErrorMessage(updateError, { entity: "company" }) });
    if (!updatedCompany) return res.status(404).json({ error: "Company not found." });

    return res.status(200).json({
      company: { id: companyId, name: company.company_name, is_active: isActive },
      message: isActive ? "Company workspace reactivated." : "Company workspace deactivated.",
    });
  } catch (error) {
    console.error("[company-status] update failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error, { entity: "company" }) });
  }
}

export default withApiLogging(handler);
