/**
 * GET /api/cron/whatsapp-automations
 *
 * Queues the WhatsApp messages each company has turned on. Sending is done by
 * /api/cron/whatsapp-drain. Runs every 5 minutes; logs counts only, never
 * client details.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { runWhatsAppAutomations } from "@/lib/whatsapp/runAutomations";

const CRON_NAME = "whatsapp-automations";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = getServiceSupabase();
  try {
    const result = await runWhatsAppAutomations(supabase);
    console.info("[cron/whatsapp-automations] finished", {
      companies: result.companies, queued: result.queued, skipped: result.skipped, errors: result.errors.length,
    });
    await recordCronHeartbeat(supabase, CRON_NAME, result.errors.length ? "error" : "ok", {
      source: auth.source, sent: result.queued, failed: result.errors.length,
      ...(result.errors.length ? { error_message: result.errors.slice(0, 3).join("; ") } : {}),
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "failed";
    console.error("[cron/whatsapp-automations] failed:", message);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", { source: auth.source, error_message: message });
    return res.status(500).json({ error: message });
  }
}

export default withApiLogging(handler);
