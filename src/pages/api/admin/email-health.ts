/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /api/admin/email-health
 *   GET  -> queue health snapshot for the caller's company
 *   POST -> drain the caller's company queue now (on-demand "send pending"),
 *           then return the fresh health. No cron secret needed - this is an
 *           authenticated operator action.
 *
 * Admin / owner only. Gives the operator visibility + manual control so a
 * stuck email queue can never sit silent again.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { drainEmailQueue, getEmailQueueHealth } from "@/lib/email/drainQueue";
import { withApiLogging } from "@/lib/withApiLogging";

const ALLOWED = new Set(["super_admin", "company_admin", "admin", "owner", "region_admin"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED.has(role)) return res.status(403).json({ error: "Admin / owner only" });
    const companyId = (profile as any)?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const service = getServiceSupabase();

    let drained: { processed: number; sent: number; failed: number } | null = null;
    if (req.method === "POST") {
      // Drain THIS company's queue regardless of auto_followups_enabled -
      // a manual operator "send now" is an explicit opt-in.
      drained = await drainEmailQueue(service as any, [companyId]);
    }

    const health = await getEmailQueueHealth(service as any, companyId);
    return res.status(200).json({ ok: true, health, drained });
  } catch (e: any) {
    console.error("[email-health] crashed:", e);
    return res.status(500).json({ error: e?.message || "Email health check failed" });
  }
}

export default withApiLogging(handler);
