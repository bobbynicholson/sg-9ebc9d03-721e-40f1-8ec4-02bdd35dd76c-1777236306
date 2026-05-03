/**
 * POST /api/imports/[id]/enable-comms
 *
 * Green-lights an import batch for outbound comms. Calls the
 * enable_comms_for_import_job(p_job_id) RPC which atomically clears
 * comms_paused_until on every leads / clients / orders / quotes row
 * tied to the batch and stamps import_jobs.comms_enabled_at.
 *
 * The RPC does its own auth check (caller must belong to the same
 * company as the job, or be super_admin) so we don't repeat that
 * here. We do the role allowlist purely for a clearer 403 message.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const jobId = String(req.query.id || "");
    if (!jobId) return res.status(400).json({ error: "Job id is required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }

    // Cast to any -- the RPC isn't in the auto-generated types yet.
    const { data, error } = await (ssr as any).rpc("enable_comms_for_import_job", {
      p_job_id: jobId,
    });
    if (error) return res.status(500).json({ error: error.message });

    // RPC returns jsonb_build_object('leads', n, 'clients', n, 'orders', n, 'quotes', n).
    return res.status(200).json({ ok: true, ...(data as any) });
  } catch (err: any) {
    console.error("[imports/enable-comms] crashed:", err);
    return res.status(500).json({ error: err?.message || "Failed to enable comms" });
  }
}
