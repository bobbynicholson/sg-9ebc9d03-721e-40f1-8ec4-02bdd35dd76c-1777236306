/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/imports
 *
 * Lists past import jobs for the caller's company. Used by the
 * imports history page so the team can resume in-progress jobs,
 * roll back completed ones (within 24h), and review summaries.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { listImportJobs } from "@/services/importService";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    const role = (profile?.active_role || profile?.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(role)) {
      return res.status(403).json({ error: "Only owners / admins can view imports" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25));
    const jobs = await listImportJobs(companyId, limit);
    return res.status(200).json({ ok: true, jobs });
  } catch (e: any) {
    console.error("/api/imports GET crashed:", e);
    return res.status(500).json({ error: e?.message || "Failed to load imports" });
  }
}

export default withApiLogging(handler);
