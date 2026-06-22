/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared email-queue drain. Claims a batch of pending rows from
 * outgoing_email_queue (FOR UPDATE SKIP LOCKED via claim_email_batch) and
 * dispatches each through emailService.sendEmail, updating row status.
 *
 * Extracted from the process-email-queue cron so the SAME code path backs:
 *   - the scheduled Vercel cron (every 15 min), and
 *   - an on-demand admin "Send pending now" button (no cron secret needed).
 *
 * Returns counts so callers can report + heartbeat.
 */
import { emailService } from "@/services/emailService";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 25;

export interface DrainResult {
  processed: number;
  sent: number;
  failed: number;
}

export async function drainEmailQueue(
  supabase: any,
  allowList: string[],
  opts?: { batchSize?: number; maxAttempts?: number },
): Promise<DrainResult> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const batchSize = opts?.batchSize ?? DEFAULT_BATCH_SIZE;

  if (!allowList || allowList.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const { data: due, error: claimErr } = await supabase.rpc("claim_email_batch", {
    p_allow_list: allowList,
    p_batch_size: batchSize,
    p_max_attempts: maxAttempts,
  });
  if (claimErr) {
    throw new Error(`claim_email_batch failed: ${claimErr.message}`);
  }

  let sent = 0;
  let failed = 0;

  for (const row of (due as any[]) || []) {
    let dispatchOk = false;
    let errorMessage: string | null = null;
    try {
      dispatchOk = await emailService.sendEmail({
        companyId: row.company_id,
        to: row.to_email,
        subject: row.subject,
        body: row.body,
        variables: row.variables || { clientName: row.to_name },
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
      const attempts = row.attempts; // already incremented by claim_email_batch
      const finalStatus = attempts >= maxAttempts ? "failed" : "queued";
      const captured = errorMessage || `Dispatch returned false (attempt ${attempts}/${maxAttempts})`;
      await supabase
        .from("outgoing_email_queue")
        .update({ status: finalStatus, error_message: captured })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return { processed: (due || []).length, sent, failed };
}

/**
 * Queue health snapshot for an allow-list of companies (or all when omitted).
 * Powers the admin Email Health panel + lets the operator see a stuck queue
 * instead of it failing silently.
 */
export interface QueueHealth {
  queued: number;
  failed: number;
  sentLast24h: number;
  oldestQueuedMinutes: number | null;
  /** True when the oldest queued email is older than the stale threshold,
   *  i.e. the worker probably isn't running. */
  stale: boolean;
}

const STALE_MINUTES = 30;

export async function getEmailQueueHealth(
  supabase: any,
  companyId?: string,
): Promise<QueueHealth> {
  const base = () => {
    let q = supabase.from("outgoing_email_queue");
    return q;
  };
  const scoped = (status: string) => {
    let q = base().select("id", { count: "exact", head: true }).eq("status", status);
    if (companyId) q = q.eq("company_id", companyId);
    return q;
  };
  const [{ count: queued }, { count: failed }] = await Promise.all([
    scoped("queued"),
    scoped("failed"),
  ]);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let sentQ = base().select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since);
  if (companyId) sentQ = sentQ.eq("company_id", companyId);
  const { count: sentLast24h } = await sentQ;

  // Oldest queued row -> how long it's been waiting.
  let oldestQ = base().select("created_at").eq("status", "queued").order("created_at", { ascending: true }).limit(1);
  if (companyId) oldestQ = oldestQ.eq("company_id", companyId);
  const { data: oldest } = await oldestQ;
  let oldestQueuedMinutes: number | null = null;
  if (oldest && oldest[0]?.created_at) {
    oldestQueuedMinutes = Math.round((Date.now() - new Date(oldest[0].created_at).getTime()) / 60000);
  }

  return {
    queued: Number(queued || 0),
    failed: Number(failed || 0),
    sentLast24h: Number(sentLast24h || 0),
    oldestQueuedMinutes,
    stale: oldestQueuedMinutes != null && oldestQueuedMinutes > STALE_MINUTES,
  };
}
