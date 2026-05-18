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
import { emailService } from "@/services/emailService";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const CRON_NAME = "process-email-queue";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  // Pessimistic claim via SECURITY DEFINER RPC. SELECT + UPDATE happen
  // in one transaction with FOR UPDATE SKIP LOCKED so two concurrent
  // workers walk away with non-overlapping batches and never race on
  // the same row [P1-09]. The previous pattern was an optimistic
  // SELECT-then-UPDATE loop which functionally worked but at scale
  // wasted traffic as every concurrent worker re-fetched the same
  // pending rows.
  const { data: due, error: readErr } = await (supabase as any).rpc(
    "claim_email_batch",
    {
      p_allow_list: allowList,
      p_batch_size: BATCH_SIZE,
      p_max_attempts: MAX_ATTEMPTS,
    }
  );
  // nowIso retained for legacy callers but the RPC uses now() server-side.
  void nowIso;

  if (readErr) {
    console.error("[cron/process-email-queue] claim failed:", readErr);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", {
      source: auth.source, error_message: readErr.message,
    });
    return res.status(500).json({ error: readErr.message });
  }

  let sent = 0;
  let failed = 0;
  const skipped = 0;

  for (const row of (due as any[]) || []) {
    // Already claimed by the RPC; row is owned by this worker.

    let dispatchOk = false;
    let errorMessage: string | null = null;
    try {
      // Wave 24: pass the service-role client so getEmailConfig can
      // read email_provider_settings under RLS. Without _client the
      // helper falls back to browser anon supabase (no session on the
      // server) - the SELECT silently returns nothing, the dispatch
      // returns false, every queued email gets retried until it hits
      // MAX_ATTEMPTS and lands in 'failed'. The bug was hiding behind
      // the legitimate "transient outage" retry loop.
      dispatchOk = await emailService.sendEmail({
        companyId: row.company_id,
        to: row.to_email,
        subject: row.subject,
        body: row.body,
        variables: row.variables || { clientName: row.to_name },
        // Quote / order tags help the dashboard group sends.
        orderId: row.trigger_event === "order" ? row.trigger_ref_id : undefined,
        quoteId: row.trigger_event === "quote" ? row.trigger_ref_id : undefined,
        _client: supabase,
      } as any);
    } catch (e: any) {
      errorMessage = e?.message || String(e);
    }

    if (dispatchOk) {
      await supabase
        .from("outgoing_email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", row.id);
      sent += 1;
    } else {
      // Hit the cap -> mark failed permanently. Otherwise return to
      // pending so the next cron tick retries.
      const newAttempts = row.attempts + 1;
      const finalStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await supabase
        .from("outgoing_email_queue")
        .update({
          status: finalStatus,
          error_message: errorMessage || `Dispatch returned false (attempt ${newAttempts}/${MAX_ATTEMPTS})`,
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  await recordCronHeartbeat(supabase, CRON_NAME, "ok", {
    source: auth.source,
    processed: (due || []).length,
    sent, failed, skipped,
  });
  return res.status(200).json({
    ok: true,
    processed: (due || []).length,
    sent,
    failed,
    skipped,
  });
}
