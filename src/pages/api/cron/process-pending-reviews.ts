/**
 * GET /api/cron/process-pending-reviews
 *
 * Cron worker that drains pending_reviews. Replaces the broken
 * notificationService.sendReviewRequest setTimeout(24h) flow --
 * Vercel serverless functions don't survive 24h, so the timer never
 * fired and zero reviews were captured platform-wide.
 *
 * Logic:
 *   - Reads pending_reviews where sent_at IS NULL AND cancelled_at
 *     IS NULL AND due_at <= now(), ordered by due_at ASC, capped at
 *     200 rows per fire.
 *   - For each row: send the review email with a secure in-app rating
 *     link (using the company's review_request template, falling back to
 *     a hardcoded body) and add an in-app notification for portal clients.
 *   - On success: stamp sent_at = now(). On failure: log + continue
 *     (a single bad recipient must not stop the batch).
 *   - Bail-cap: 5min wall clock or 200 rows, whichever hits first.
 *
 * Auth: shared CRON_SECRET via Authorization: Bearer ${CRON_SECRET}.
 *
 * Vercel cron schedule: every 15 minutes (configured in vercel.json)
 * - matches process-email-queue / late-event-check granularity.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendOrderReviewRequest } from "@/services/order/sendReviewRequest";
import { mintOrderCustomerLink } from "@/lib/customerLinksServer";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "process-pending-reviews";
const BATCH_LIMIT = 200;
const RUNTIME_CAP_MS = 5 * 60 * 1000;

type PendingReview = {
  id: string;
  company_id: string;
  order_id: string;
  client_id: string | null;
  client_email: string | null;
  client_name: string | null;
  delivered_at: string;
  due_at: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const supabase: any = getServiceSupabase();
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("pending_reviews")
    .select("id, company_id, order_id, client_id, client_email, client_name, delivered_at, due_at")
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[cron/process-pending-reviews] read failed:", error);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", { source: auth.source, run_id: auth.runId, error_message: error.message });
    return res.status(500).json({ error: error.message });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let bailed = false;

  for (const row of (due || []) as PendingReview[]) {
    if (Date.now() - startedAt > RUNTIME_CAP_MS) {
      bailed = true;
      break;
    }

    try {
      const sendResult = await sendOrderReviewRequest(supabase, row.order_id);

      const terminalSkip = ["already_reviewed", "already_sent", "missing_email"].includes(sendResult.reason || "");
      if (!sendResult.sent && !terminalSkip) {
        // Settings-off / duplicate-window skips are not successful sends.
        // Leave the row due so it can be retried and never claim an email was
        // sent when the provider did not accept it.
        skipped += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("pending_reviews")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("sent_at", null);

      if (updateError) {
        console.error("[cron/process-pending-reviews] sent_at stamp failed:", updateError);
        failed += 1;
      } else if (sendResult.sent) {
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (e) {
      console.error("[cron/process-pending-reviews] row failed:", row.id, e);
      failed += 1;
    }
  }

  await recordCronHeartbeat(supabase, CRON_NAME, failed > 0 ? "error" : "ok", {
    source: auth.source, run_id: auth.runId,
    checked: (due || []).length,
    sent, skipped, failed, bailed,
    runtime_ms: Date.now() - startedAt,
  });
  return res.status(200).json({
    ok: true,
    checked: (due || []).length,
    sent,
    skipped,
    failed,
    bailed,
    runtime_ms: Date.now() - startedAt,
  });
}

export default withApiLogging(handler);
