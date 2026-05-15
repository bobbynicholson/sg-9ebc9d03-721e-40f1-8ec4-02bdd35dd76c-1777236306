/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/imports/[id]
 *
 * Wizard polls this between steps to read job status, mapping, and
 * the per-row preview.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getImportJob, listImportRows } from "@/services/importService";

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET" && req.method !== "PATCH" && req.method !== "DELETE") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    if (profileErr) {
      console.error("[imports/[id]/index] profiles fetch failed:", profileErr);
    }
    const role = (profile?.active_role || profile?.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(role)) {
      return res.status(403).json({ error: "Only owners / admins can view imports" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const jobId = String(req.query.id || "");
    if (!jobId) return res.status(400).json({ error: "Missing job id" });

    const job = await getImportJob(jobId, companyId);
    if (!job) return res.status(404).json({ error: "Import job not found" });

    if (req.method === "DELETE") {
      // Discard an import job. Used for test runs the operator never
      // finished mapping. We refuse to delete a completed job because
      // the rows it inserted are live data; the user should run rollback
      // (which cleans the data and marks the job as rolled_back) and
      // can then delete the rolled_back row from history.
      const status = String((job as any).status || "").toLowerCase();
      if (status === "completed") {
        return res.status(409).json({
          error: "This import is completed and has live data. Run rollback first, then delete.",
        });
      }
      const sb = (await import("@/lib/supabase/service")).getServiceSupabase() as any;
      // import_rows has ON DELETE CASCADE on job_id, so deleting the
      // parent job removes every preview row. Belt and braces: also
      // delete the rows directly in case the FK was ever altered.
      await sb.from("import_rows").delete().eq("job_id", jobId);
      const { error } = await sb
        .from("import_jobs")
        .delete()
        .eq("id", jobId)
        .eq("company_id", companyId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, deleted: true });
    }

    if (req.method === "PATCH") {
      // Allow the wizard to save the (operator-edited) mapping back
      // before running the preview step. Only a small allowlist of
      // fields can be patched -- never status, never company_id.
      const body = (req.body || {}) as any;
      const patch: any = {};
      if (body.mapping !== undefined) patch.mapping = body.mapping;
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nothing to update" });
      }
      const sb = (await import("@/lib/supabase/service")).getServiceSupabase() as any;
      const { error } = await sb
        .from("import_jobs")
        .update(patch)
        .eq("id", jobId)
        .eq("company_id", companyId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // Fetch up to 11k rows so the wizard's drilldown sees the full
    // import, not just the first 1000. listImportRows pages internally
    // so this no longer hits the PostgREST 1000-row cap.
    const includeRows = req.query.rows === "1";
    const rows = includeRows ? await listImportRows(jobId, { limit: 11000 }) : [];

    return res.status(200).json({ ok: true, job, rows });
  } catch (outer: any) {
    console.error("imports/[id] GET crashed:", outer);
    return res.status(500).json({ error: outer?.message || "Failed to load job" });
  }
}
