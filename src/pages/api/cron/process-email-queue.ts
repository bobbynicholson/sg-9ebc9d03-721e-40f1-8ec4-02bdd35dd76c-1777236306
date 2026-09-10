/**
 * GET /api/cron/process-email-queue
 *
 * Cron worker (item #4). Walks outgoing_email_queue for rows that are
 * pending and due (scheduled_for IS NULL OR scheduled_for <= NOW())
 * and dispatches each one through emailService.sendEmail. The send
 * runs the same negative gates (blocked_contacts + comms_paused) so
 * paused recipients don't slip through automation.
 *
 * Auth: Vercel Cron sets the `Authorization: Bearer <CRON_SECRET>`
 * header on every fire. Reject anything that doesn't match.
 *
 * Scheduling: vercel.json adds a cron entry hitting this endpoint
 * every 15 minutes. That's plenty of granularity for after-sales
 * windows (which are measured in months) and avoids hammering the
 * email provider on quieter platforms.
 *
 * Failure handling: increments attempts on every fire. Hard-cap at
 * 5 attempts - after which the row stays in the queue with status
 * 'failed' for admin review (the resend dashboard from item #9 can
 * surface them). A transient Resend outage is recoverable; a bad
 * recipient address is not.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { drainEmailQueue } from "@/lib/email/drainQueue";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const CRON_NAME = "process-email-queue";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron sends GET. Reject anything else early.
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth: Vercel cron bearer OR authenticated super_admin session.
  // See src/lib/cronAuth.ts for the shared policy.
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const supabase: any = getServiceSupabase();
  const nowIso = new Date().toISOString();

  // Per-tenant gate. Default policy is "operator drives every send"
  // - companies.auto_followups_enabled is FALSE on every row until
  // the operator explicitly opts in. Pull the allow-list once and
  // filter the queue read so we never auto-send for a tenant that
  // hasn't asked for it. Keeps the queue infrastructure in place for
  // the day they flip the flag.
  const { data: optedIn } = await supabase
    .from("companies")
    .select("id")
    .eq("auto_followups_enabled", true);
  const allowList = ((optedIn || []) as any[]).map((c) => c.id);
  if (allowList.length === 0) {
    await recordCronHeartbeat(supabase, CRON_NAME, "ok", {
      source: auth.source, sent: 0, failed: 0, skipped: 0,
      note: "no_opted_in_tenants",
    });
    return res.status(200).json({
      ok: true,
      sent: 0, failed: 0, skipped: 0,
      note: "No tenants have auto_followups_enabled. Nothing to send.",
    });
  }

  // Single shared drain path (also used by the on-demand admin "send now"
  // endpoint) so the send + retry + status lifecycle lives in one place.
  // nowIso retained for legacy callers but the RPC uses now() server-side.
  void nowIso;

  let result;
  try {
    result = await drainEmailQueue(supabase, allowList, {
      batchSize: BATCH_SIZE,
      maxAttempts: MAX_ATTEMPTS,
    });
  } catch (e: any) {
    console.error("[cron/process-email-queue] drain failed:", e);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", {
      source: auth.source, error_message: e?.message || String(e),
    });
    return res.status(500).json({ error: e?.message || "drain failed" });
  }

  await recordCronHeartbeat(supabase, CRON_NAME, "ok", {
    source: auth.source,
    processed: result.processed,
    sent: result.sent, failed: result.failed, skipped: 0,
  });
  return res.status(200).json({
    ok: true,
    processed: result.processed,
    sent: result.sent,
    failed: result.failed,
    skipped: 0,
  });
}

export default withApiLogging(handler);
