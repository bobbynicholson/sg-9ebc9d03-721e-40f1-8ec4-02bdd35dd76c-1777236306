/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared email-queue drain. Claims a batch of pending rows from
 * outgoing_email_queue (atomic claims) and dispatches each through the
 * central email transport, updating row status.
 *
 * Extracted from the process-email-queue cron so the SAME code path backs:
 *   - the scheduled Vercel cron (every 15 min), and
 *   - an on-demand admin "Send pending now" button (no cron secret needed).
 *
 * Returns counts so callers can report + heartbeat.
 */
import { emailService } from "@/services/emailService";
import { TRANSACTIONAL_EMAIL_EVENTS, queuedEmailReference } from "./queuePolicy";

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
  opts?: { batchSize?: number; maxAttempts?: number; transactionalOnly?: boolean },
): Promise<DrainResult> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const batchSize = opts?.batchSize ?? DEFAULT_BATCH_SIZE;

  if (!allowList || allowList.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  let due: any[];
  if (opts?.transactionalOnly) {
    // A compare-and-set claim permits transactional mail for every company
    // without changing the existing marketing RPC or needing a DB migration.
    const selected = await supabase.from("outgoing_email_queue").select("*")
      .eq("status", "queued").in("company_id", allowList)
      .in("trigger_event", [...TRANSACTIONAL_EMAIL_EVENTS])
      .lt("attempts", maxAttempts)
      .or(`scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true }).limit(batchSize);
    if (selected.error) throw new Error(`Transactional email queue read failed: ${selected.error.message}`);
    due = selected.data || [];
  } else {
    const claimed = await supabase.rpc("claim_email_batch", {
      p_allow_list: allowList, p_batch_size: batchSize, p_max_attempts: maxAttempts,
    });
    if (claimed.error) throw new Error(`claim_email_batch failed: ${claimed.error.message}`);
    due = claimed.data || [];
  }

  let sent = 0;
  let failed = 0;
  let processed = 0;

  for (const candidate of due) {
    let row = candidate;
    if (opts?.transactionalOnly) {
      const claim = await supabase.from("outgoing_email_queue")
        .update({ status: "in_progress", attempts: candidate.attempts + 1 })
        .eq("id", candidate.id).eq("company_id", candidate.company_id)
        .eq("status", "queued").eq("attempts", candidate.attempts)
        .select("*").maybeSingle();
      if (claim.error) throw new Error(`Transactional email claim failed: ${claim.error.message}`);
      if (!claim.data) continue; // another worker has claimed/completed it
      row = claim.data;
    }
    processed += 1;
    let dispatchOk = false;
    let sentAt: string | null = null;
    let errorMessage: string | null = null;
    try {
      // The legacy status trigger can race the direct composer send. A
      // successful quote receipt satisfies that row even if the composer
      // closed before it could complete the queued duplicate itself.
      if (row.trigger_event === "quote.sent" && row.trigger_ref_id) {
        const receipt = await supabase.from("quotes").select("sent_at, client_email")
          .eq("id", row.trigger_ref_id).eq("company_id", row.company_id).maybeSingle();
        if (receipt.error) throw new Error(`Quote email receipt read failed: ${receipt.error.message}`);
        if (receipt.data?.sent_at && String(receipt.data.client_email || "").trim().toLowerCase() === String(row.to_email || "").trim().toLowerCase()) {
          dispatchOk = true;
          sentAt = receipt.data.sent_at;
        }
      }
      if (!dispatchOk) {
        const delivery = await emailService.sendEmailDetailed({
          idempotencyKey: `email-queue/${row.id}`,
          companyId: row.company_id,
          to: row.to_email,
          subject: row.subject,
          body: row.body,
          templateType: row.template_type,
          variables: row.variables || { clientName: row.to_name },
          ...queuedEmailReference(row.trigger_event, row.trigger_ref_id),
          _client: supabase,
        } as any);
        dispatchOk = delivery.success;
        if (!delivery.success) errorMessage = [delivery.error_code, delivery.error].filter(Boolean).join(": ") || "Email provider rejected the message";
      }
    } catch (e: any) {
      errorMessage = e?.message || String(e);
    }

    if (dispatchOk) {
      const saved = await supabase
        .from("outgoing_email_queue")
        .update({ status: "sent", sent_at: sentAt || new Date().toISOString(), error_message: null })
        .eq("id", row.id).eq("company_id", row.company_id);
      if (saved.error) throw new Error(`Email sent, but queue receipt failed: ${saved.error.message}`);
      sent += 1;
    } else {
      const attempts = row.attempts; // already incremented by claim_email_batch
      const finalStatus = attempts >= maxAttempts ? "failed" : "queued";
      const captured = errorMessage || `Dispatch returned false (attempt ${attempts}/${maxAttempts})`;
      const saved = await supabase
        .from("outgoing_email_queue")
        .update({ status: finalStatus, error_message: captured })
        .eq("id", row.id).eq("company_id", row.company_id);
      if (saved.error) throw new Error(`Email retry could not be saved: ${saved.error.message}`);
      failed += 1;
    }
  }

  return { processed, sent, failed };
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
  const base = () => supabase.from("outgoing_email_queue");
  const scoped = (status: string) => {
    let q = base().select("id", { count: "exact", head: true }).eq("status", status);
    if (companyId) q = q.eq("company_id", companyId);
    return q;
  };
  const [queuedResult, failedResult] = await Promise.all([
    scoped("queued"),
    scoped("failed"),
  ]);
  if (queuedResult.error) throw queuedResult.error;
  if (failedResult.error) throw failedResult.error;
  const queued = queuedResult.count;
  const failed = failedResult.count;

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let sentQ = base().select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since);
  if (companyId) sentQ = sentQ.eq("company_id", companyId);
  const { count: sentLast24h, error: sentError } = await sentQ;
  if (sentError) throw sentError;

  // Oldest queued row -> how long it's been waiting.
  let oldestQ = base().select("created_at").eq("status", "queued").order("created_at", { ascending: true }).limit(1);
  if (companyId) oldestQ = oldestQ.eq("company_id", companyId);
  const { data: oldest, error: oldestError } = await oldestQ;
  if (oldestError) throw oldestError;
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
