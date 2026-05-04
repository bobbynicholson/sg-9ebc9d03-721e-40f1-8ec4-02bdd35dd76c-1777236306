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
 * 5 attempts -- after which the row stays in the queue with status
 * 'failed' for admin review (the resend dashboard from item #9 can
 * surface them). A transient Resend outage is recoverable; a bad
 * recipient address is not.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emailService } from "@/services/emailService";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron sends GET. Reject anything else early.
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth -- shared secret check. Vercel Cron passes
  // Authorization: Bearer ${CRON_SECRET}.
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (expected && auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const supabase: any = getServiceSupabase();
  const nowIso = new Date().toISOString();

  // Per-tenant gate. Default policy is "operator drives every send"
  // -- companies.auto_followups_enabled is FALSE on every row until
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
    return res.status(200).json({
      ok: true,
      sent: 0, failed: 0, skipped: 0,
      note: "No tenants have auto_followups_enabled. Nothing to send.",
    });
  }

  // Pull the next batch of due-and-pending rows for opted-in tenants.
  const { data: due, error: readErr } = await supabase
    .from("outgoing_email_queue")
    .select("id, company_id, to_email, to_name, subject, body, template_type, variables, attempts, trigger_event, trigger_ref_id")
    .eq("status", "pending")
    .in("company_id", allowList)
    .lt("attempts", MAX_ATTEMPTS)
    .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
    .order("scheduled_for", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (readErr) {
    console.error("[cron/process-email-queue] read failed:", readErr);
    return res.status(500).json({ error: readErr.message });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due || []) {
    // Mark as in_progress to stop another concurrent cron run from
    // picking the same row. Cheap optimistic lock -- if the update
    // affects 0 rows somebody else has it, skip.
    const { data: claimed } = await supabase
      .from("outgoing_email_queue")
      .update({
        status: "in_progress",
        attempts: row.attempts + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) {
      skipped += 1;
      continue;
    }

    let dispatchOk = false;
    let errorMessage: string | null = null;
    try {
      dispatchOk = await emailService.sendEmail({
        companyId: row.company_id,
        to: row.to_email,
        subject: row.subject,
        body: row.body,
        variables: row.variables || { clientName: row.to_name },
        // Quote / order tags help the dashboard group sends.
        orderId: row.trigger_event === "order" ? row.trigger_ref_id : undefined,
        quoteId: row.trigger_event === "quote" ? row.trigger_ref_id : undefined,
      });
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

  return res.status(200).json({
    ok: true,
    processed: (due || []).length,
    sent,
    failed,
    skipped,
  });
}
