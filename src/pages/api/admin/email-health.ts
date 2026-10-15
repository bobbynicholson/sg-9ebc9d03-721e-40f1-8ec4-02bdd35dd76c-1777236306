/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /api/admin/email-health
 *   GET  -> queue health snapshot for the caller's company
 *   POST -> drain the caller's due queue now (on-demand "send pending"), or
 *           release one explicitly selected queued email immediately when
 *           body.queueId is supplied. No cron secret needed - this is an
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
      const queueId = typeof req.body?.queueId === "string" ? req.body.queueId.trim() : "";
      if (queueId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(queueId)) {
        return res.status(400).json({ error: "Invalid queued email ID" });
      }
      if (queueId) {
        drained = await drainEmailQueue(service as any, [companyId], { queueIds: [queueId], batchSize: 1 });
      } else {
        // "Send due emails now" is the admin's approval for everything
        // waiting: emails held for approval plus queued emails already due.
        const { data: waiting, error: waitingError } = await (service as any)
          .from("outgoing_email_queue")
          .select("id")
          .eq("company_id", companyId)
          .eq("status", "awaiting_approval")
          .order("created_at", { ascending: true })
          .limit(50);
        if (waitingError) throw new Error(`Approval list read failed: ${waitingError.message}`);
        const waitingIds = ((waiting || []) as Array<{ id: string }>).map((r) => r.id);
        const approved = waitingIds.length
          ? await drainEmailQueue(service as any, [companyId], { queueIds: waitingIds, batchSize: waitingIds.length })
          : { processed: 0, sent: 0, failed: 0 };
        const due = await drainEmailQueue(service as any, [companyId]);
        drained = {
          processed: approved.processed + due.processed,
          sent: approved.sent + due.sent,
          failed: approved.failed + due.failed,
        };
      }
    }

    const health = await getEmailQueueHealth(service as any, companyId);
    return res.status(200).json({ ok: true, health, drained });
  } catch (e: any) {
    console.error("[email-health] crashed:", e);
    return res.status(500).json({ error: e?.message || "Email health check failed" });
  }
}

export default withApiLogging(handler);
