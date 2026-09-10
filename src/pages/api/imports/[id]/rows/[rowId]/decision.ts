/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/[id]/rows/[rowId]/decision
 *
 * Set the dedup decision for a single import row. Called from the
 * wizard's "Review duplicates" panel when the operator picks how to
 * handle a row that matched an existing client / lead.
 *
 * Body: { decision: 'skip' | 'update' | 'create_new' }
 *
 * 'skip'       -> commit pass leaves the existing record alone (default)
 * 'update'     -> commit pass UPDATEs the matched record with mapped_data
 * 'create_new' -> commit pass inserts a fresh record, ignoring the match
 *
 * Tenant scoping: company_id from session, row + parent job both
 * checked against it.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getImportJob } from "@/services/importService";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const VALID_DECISIONS = new Set(["skip", "update", "create_new"]);

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
      return res.status(403).json({ error: "Only owners / admins can change import decisions" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const jobId = String(req.query.id || "");
    const rowId = String(req.query.rowId || "");
    if (!jobId || !rowId) return res.status(400).json({ error: "Missing job id or row id" });

    const decision = (req.body && typeof req.body === "object")
      ? String((req.body as any).decision || "")
      : "";
    if (!VALID_DECISIONS.has(decision)) {
      return res.status(400).json({
        error: "Invalid decision, expected 'skip' | 'update' | 'create_new'",
      });
    }

    const job = await getImportJob(jobId, companyId);
    if (!job) return res.status(404).json({ error: "Import job not found" });

    const supabase = getServiceSupabase() as any;

    // Confirm the row belongs to this job (and via the job, this
    // tenant) before we touch it. Cheap and worth it.
    const { data: row } = await supabase
      .from("import_rows")
      .select("id, dedup_match_id")
      .eq("id", rowId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: "Row not found in this job" });

    if (!(row as any).dedup_match_id && decision !== "create_new") {
      // No match was found in preview, so 'skip' / 'update' don't
      // apply. The wizard shouldn't expose this on a clean row, but
      // be defensive.
      return res.status(409).json({
        error: "Row has no dedup match, decision only valid for matched rows",
      });
    }

    const { error: updErr } = await supabase
      .from("import_rows")
      .update({ dedup_decision: decision } as any)
      .eq("id", rowId);
    if (updErr) throw new Error(updErr.message);

    return res.status(200).json({ ok: true, decision });
  } catch (outer: any) {
    console.error("imports/[id]/rows/[rowId]/decision handler crashed:", outer);
    return res.status(500).json({ error: dbErrorMessage(outer) || "Set decision failed" });
  }
}

export default withApiLogging(handler);
