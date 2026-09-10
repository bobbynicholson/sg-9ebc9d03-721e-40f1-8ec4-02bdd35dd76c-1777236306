/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/[id]/rollback
 *
 * Reverse a completed import: delete every clients + orders row that
 * carries this job's import_job_id, mark the job as rolled_back.
 * Equipment, quotes and other tables are untouched.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { rollbackImportJob } from "@/services/importService";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
      return res.status(403).json({ error: "Only owners / admins can run imports" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const jobId = String(req.query.id || "");
    if (!jobId) return res.status(400).json({ error: "Missing job id" });

    const result = await rollbackImportJob(jobId, companyId);
    return res.status(200).json({ ok: true, ...result });
  } catch (outer: any) {
    console.error("imports/[id]/rollback handler crashed:", outer);
    return res.status(500).json({ error: dbErrorMessage(outer) || "Rollback failed" });
  }
}

export default withApiLogging(handler);
