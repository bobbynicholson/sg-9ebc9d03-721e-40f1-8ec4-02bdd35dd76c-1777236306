/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Cron: hard-delete old rows from email_automation_log and the sent
 * tail of outgoing_email_queue.
 *
 * Wave 24: the email-failures dashboard pulls the most recent 100
 * rows from email_automation_log and the resend dashboard walks
 * outgoing_email_queue. Both tables grow with every send (a busy
 * tenant fires hundreds per month). Without cleanup, year-old
 * success rows dominate the dashboard and the operator can't see
 * the live failures that actually need triage.
 *
 * Two passes, one cron:
 *
 *   1. email_automation_log:
 *      DELETE WHERE created_at < (now - 180 days)
 *      All statuses included -- a 6-month-old "failed" isn't
 *      actionable anymore; if it mattered it was actioned by then.
 *
 *   2. outgoing_email_queue:
 *      DELETE WHERE status IN ('sent','failed')
 *        AND created_at < (now - 180 days)
 *      Keep 'pending' / 'scheduled' rows regardless of age (a long-
 *      lead after-sales row scheduled 12 months out must not be
 *      pruned before its scheduled_for hits).
 *
 * Idempotent. Both passes match only rows older than the cutoff so
 * re-running mid-week is a no-op.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Schedule: weekly, Sunday 03:30 UTC -- 30 min after the
 * notification archival job so they don't pile on the DB at once.
 */

const ARCHIVE_AGE_DAYS = 180;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const provided = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sb = getServiceSupabase();
    const cutoffIso = new Date(Date.now() - ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // --- Pass 1: email_automation_log ------------------------------
    const { count: logCount, error: logCountErr } = await (sb as any)
      .from("email_automation_log")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoffIso);

    if (logCountErr) {
      console.error("[archive-old-email-rows] log count failed:", logCountErr);
      return res.status(500).json({ error: logCountErr.message });
    }

    let logArchived = 0;
    if (logCount && logCount > 0) {
      const { error: logDelErr } = await (sb as any)
        .from("email_automation_log")
        .delete()
        .lt("created_at", cutoffIso);
      if (logDelErr) {
        console.error("[archive-old-email-rows] log delete failed:", logDelErr);
        return res.status(500).json({ error: logDelErr.message });
      }
      logArchived = logCount;
    }

    // --- Pass 2: outgoing_email_queue (terminal rows only) --------
    // Keep pending / scheduled rows regardless of age. A 12-month
    // after-sales row scheduled for next year must not be pruned.
    const { count: queueCount, error: queueCountErr } = await (sb as any)
      .from("outgoing_email_queue")
      .select("id", { count: "exact", head: true })
      .in("status", ["sent", "failed"])
      .lt("created_at", cutoffIso);

    if (queueCountErr) {
      console.error("[archive-old-email-rows] queue count failed:", queueCountErr);
      return res.status(500).json({ error: queueCountErr.message });
    }

    let queueArchived = 0;
    if (queueCount && queueCount > 0) {
      const { error: queueDelErr } = await (sb as any)
        .from("outgoing_email_queue")
        .delete()
        .in("status", ["sent", "failed"])
        .lt("created_at", cutoffIso);
      if (queueDelErr) {
        console.error("[archive-old-email-rows] queue delete failed:", queueDelErr);
        return res.status(500).json({ error: queueDelErr.message });
      }
      queueArchived = queueCount;
    }

    return res.status(200).json({
      ok: true,
      cutoff_iso: cutoffIso,
      email_automation_log_archived: logArchived,
      outgoing_email_queue_archived: queueArchived,
    });
  } catch (e: any) {
    console.error("[archive-old-email-rows] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
