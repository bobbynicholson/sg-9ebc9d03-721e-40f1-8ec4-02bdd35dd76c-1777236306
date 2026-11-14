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
import { resolveEmailDeliveryMode } from "./automatedEmailTemplates";
import { hasEventDatePassed } from "@/lib/eventDateGuard";

const EVENT_DATE_ORDER_REMINDERS = new Set([
  "pre_event",
  "kitchen_pre_event",
  "event_tomorrow_admin_email",
  "event_tomorrow_kitchen_email",
  "event_shopping_lead_email",
  "payment.deposit_reminder",
  "outsource.pre_event_reminder",
]);

function requiresEventDateCheck(row: any): boolean {
  return EVENT_DATE_ORDER_REMINDERS.has(String(row?.trigger_event || ""))
    || row?.trigger_event === "quote.followup";
}

async function loadQueuedEventDateContext(supabase: any, row: any): Promise<{ eventDate: string | null; timezone: string | null }> {
  const isQuote = row.trigger_event === "quote.followup";
  const table = isQuote ? "quotes" : "orders";
  const refId = row.trigger_ref_id;
  if (!refId) return { eventDate: null, timezone: null };

  const { data: record, error: recordError } = await supabase
    .from(table)
    .select("event_date")
    .eq("id", refId)
    .eq("company_id", row.company_id)
    .maybeSingle();
  if (recordError) throw new Error(`Event date lookup failed: ${recordError.message}`);

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", row.company_id)
    .maybeSingle();
  if (companyError) throw new Error(`Event timezone lookup failed: ${companyError.message}`);

  return { eventDate: record?.event_date || null, timezone: company?.timezone || null };
}

/**
 * The "booking confirmed" email (order.created, queued by the database
 * when an order is created) for an order that came from an accepted
 * quote. Orders created without a quote keep that email.
 */
export async function isQuoteAcceptanceBookingEmail(supabase: any, row: any): Promise<boolean> {
  if (row?.trigger_event !== "order.created" || !row?.trigger_ref_id) return false;
  const { data, error } = await supabase
    .from("orders")
    .select("quote_id")
    .eq("id", row.trigger_ref_id)
    .eq("company_id", row.company_id)
    .maybeSingle();
  if (error) throw new Error(`Order lookup for booking email failed: ${error.message}`);
  return !!data?.quote_id;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 25;
const STALE_CLAIM_MINUTES = 30;

export interface DrainResult {
  processed: number;
  sent: number;
  failed: number;
  recovered?: number;
  /** Due emails not sent because they are turned off in Email settings. */
  turnedOff?: number;
  /** Event reminders cancelled because the event date has passed. */
  skippedPastEvent?: number;
}

export async function drainEmailQueue(
  supabase: any,
  allowList: string[],
  opts?: {
    batchSize?: number;
    maxAttempts?: number;
    transactionalOnly?: boolean;
    queueIds?: string[];
    /**
     * Scheduled worker only: Email settings per company. A due email that
     * is turned off ("Off") is cancelled instead of sent. Omitted = an
     * admin's own "Send now" run, which always sends.
     */
    deliveryPreferences?: Map<string, unknown>;
  },
): Promise<DrainResult> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const batchSize = opts?.batchSize ?? DEFAULT_BATCH_SIZE;

  if (!allowList || allowList.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  // Recover abandoned claims before selecting due work. The provider receives
  // the same idempotency key on every retry, covering a crash after acceptance
  // but before the queue receipt is saved.
  const staleClaimBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  const staleClaims = await supabase.from("outgoing_email_queue")
    .select("id, company_id, attempts, claimed_at, created_at")
    .eq("status", "in_progress")
    .in("company_id", allowList)
    .or(`claimed_at.lt.${staleClaimBefore},and(claimed_at.is.null,created_at.lt.${staleClaimBefore})`)
    .limit(batchSize * 2);
  if (staleClaims.error) throw new Error(`Stale email claim scan failed: ${staleClaims.error.message}`);

  let recovered = 0;
  let recoveredFailed = 0;
  for (const stale of staleClaims.data || []) {
    const exhausted = Number(stale.attempts || 0) >= maxAttempts;
    let recovery = supabase.from("outgoing_email_queue").update({
      status: exhausted ? "failed" : "queued",
      claimed_at: null,
      error_message: exhausted
        ? "Worker stopped during delivery after the maximum attempts. Verify provider delivery before manually retrying."
        : "Recovered an abandoned worker claim; retrying with the same email idempotency key.",
    });
    recovery = stale.claimed_at
      ? recovery.eq("claimed_at", stale.claimed_at)
      : recovery.is("claimed_at", null).lt("created_at", staleClaimBefore);
    const result = await recovery
      .eq("id", stale.id).eq("company_id", stale.company_id).eq("status", "in_progress")
      .select("id").maybeSingle();
    if (result.error) throw new Error(`Stale email claim recovery failed: ${result.error.message}`);
    if (result.data) {
      if (exhausted) recoveredFailed += 1;
      else recovered += 1;
    }
  }

  let due: any[];
  if (opts?.queueIds?.length) {
    // An authorised admin selected one or more rows for immediate release.
    // This intentionally ignores scheduled_for: the explicit button is the
    // approval, so it may release a reminder before its scheduled time.
    const selected = await supabase.from("outgoing_email_queue").select("*")
      .in("status", ["queued", "awaiting_approval"]).in("company_id", allowList)
      .in("id", opts.queueIds)
      .lt("attempts", maxAttempts)
      .order("created_at", { ascending: true }).limit(batchSize);
    if (selected.error) throw new Error(`Selected email queue read failed: ${selected.error.message}`);
    due = selected.data || [];
  } else if (opts?.transactionalOnly) {
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
  let failed = recoveredFailed;
  let processed = 0;
  let turnedOff = 0;
  let skippedPastEvent = 0;
  const eventDateContextCache = new Map<string, Promise<{ eventDate: string | null; timezone: string | null }>>();

  for (const candidate of due) {
    let row = candidate;
    if (opts?.transactionalOnly || opts?.queueIds?.length) {
      const claim = await supabase.from("outgoing_email_queue")
        .update({ status: "in_progress", attempts: candidate.attempts + 1, claimed_at: new Date().toISOString() })
        .eq("id", candidate.id).eq("company_id", candidate.company_id)
        .in("status", ["queued", "awaiting_approval"]).eq("attempts", candidate.attempts)
        .select("*").maybeSingle();
      if (claim.error) throw new Error(`Transactional email claim failed: ${claim.error.message}`);
      if (!claim.data) continue; // another worker has claimed/completed it
      row = claim.data;
    }
    if (opts?.deliveryPreferences && !opts?.queueIds?.length) {
      const preferences = opts.deliveryPreferences.get(row.company_id);
      if (resolveEmailDeliveryMode(preferences, row.template_type) === "off") {
        // Turned off in Email settings: never sent, kept as a record.
        const cancelled = await supabase
          .from("outgoing_email_queue")
          .update({ status: "cancelled", claimed_at: null, error_message: "Not sent: turned off in Email settings" })
          .eq("id", row.id).eq("company_id", row.company_id).eq("status", "in_progress").eq("attempts", row.attempts);
        if (cancelled.error) throw new Error(`Turned-off email could not be cancelled: ${cancelled.error.message}`);
        turnedOff += 1;
        continue;
      }
    }
    if (!opts?.queueIds?.length && await isQuoteAcceptanceBookingEmail(supabase, row)) {
      // Quote-acceptance flow: the deposit invoice email is the only email
      // when a quote is accepted, and the order link goes out once the
      // deposit is paid. Kept as a record, never sent.
      const cancelled = await supabase
        .from("outgoing_email_queue")
        .update({ status: "cancelled", claimed_at: null, error_message: "Not sent: on quote acceptance the deposit invoice email is the only email" })
        .eq("id", row.id).eq("company_id", row.company_id).eq("status", "in_progress").eq("attempts", row.attempts);
      if (cancelled.error) throw new Error(`Booking email could not be cancelled: ${cancelled.error.message}`);
      continue;
    }
    processed += 1;
    let dispatchOk = false;
    let sentAt: string | null = null;
    let errorMessage: string | null = null;
    try {
      if (requiresEventDateCheck(row)) {
        const cacheKey = `${row.trigger_event}:${row.company_id}:${row.trigger_ref_id}`;
        let contextPromise = eventDateContextCache.get(cacheKey);
        if (!contextPromise) {
          contextPromise = loadQueuedEventDateContext(supabase, row);
          eventDateContextCache.set(cacheKey, contextPromise);
        }
        const context = await contextPromise;
        if (hasEventDatePassed(context.eventDate, new Date(), context.timezone)) {
          const cancelled = await supabase
            .from("outgoing_email_queue")
            .update({ status: "cancelled", claimed_at: null, error_message: "Not sent: event date has passed" })
            .eq("id", row.id).eq("company_id", row.company_id).eq("status", "in_progress").eq("attempts", row.attempts);
          if (cancelled.error) throw new Error(`Past-event reminder could not be cancelled: ${cancelled.error.message}`);
          skippedPastEvent += 1;
          continue;
        }
      }
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
          // Keep the queue's logical template key so a tenant template
          // override is applied when an admin releases a held email.
          template: row.template_type || undefined,
          templateType: row.template_type,
          variables: row.variables || { clientName: row.to_name },
          ...queuedEmailReference(row.trigger_event, row.trigger_ref_id),
          // Email settings already checked above (scheduled run) or this is
          // an admin's own "Send now".
          _deliveryApproved: true,
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
        .update({ status: "sent", sent_at: sentAt || new Date().toISOString(), claimed_at: null, error_message: null })
        .eq("id", row.id).eq("company_id", row.company_id).eq("status", "in_progress").eq("attempts", row.attempts)
        .select("id");
      if (saved.error) throw new Error(`Email sent, but queue receipt failed: ${saved.error.message}`);
      if (!saved.data?.length) continue; // another invocation has recovered this lease
      // Quote follow-up cadence advances only after the held email is
      // actually delivered. The values are internal queue metadata and are
      // ignored by template variable replacement.
      if (row.trigger_event === "quote.followup" && row.trigger_ref_id) {
        const position = Number(row.variables?._followup_position);
        if (Number.isInteger(position) && position > 0) {
          const { recordFollowupSent } = await import("@/services/quoteFollowupService");
          const logged = await recordFollowupSent({
            companyId: row.company_id,
            quoteId: row.trigger_ref_id,
            position,
            templateKey: row.template_type || "email_lead_quoted",
            channel: "email",
            sentByUserId: null,
            notes: "released from admin email approval queue",
            client: supabase,
          });
          if (!logged.ok) console.error("Email sent, but quote follow-up receipt failed:", logged.error);
        }
      }
      sent += 1;
    } else {
      const attempts = row.attempts; // already incremented by claim_email_batch
      // A manually approved row must not become worker-eligible after a
      // transient failure. It stays with the admin until they retry it.
      const finalStatus = attempts >= maxAttempts
        ? "failed"
        : opts?.queueIds?.length
          ? "awaiting_approval"
          : "queued";
      const captured = errorMessage || `Dispatch returned false (attempt ${attempts}/${maxAttempts})`;
      const saved = await supabase
        .from("outgoing_email_queue")
        .update({ status: finalStatus, claimed_at: null, error_message: captured })
        .eq("id", row.id).eq("company_id", row.company_id).eq("status", "in_progress").eq("attempts", row.attempts)
        .select("id");
      if (saved.error) throw new Error(`Email retry could not be saved: ${saved.error.message}`);
      if (!saved.data?.length) continue;
      failed += 1;
    }
  }

  return {
    processed,
    sent,
    failed,
    recovered,
    ...(turnedOff > 0 ? { turnedOff } : {}),
    ...(skippedPastEvent > 0 ? { skippedPastEvent } : {}),
  };
}


/**
 * Queue health snapshot for an allow-list of companies (or all when omitted).
 * Powers the admin Email Health panel + lets the operator see a stuck queue
 * instead of it failing silently.
 */
export interface QueueHealth {
  queued: number;
  inProgress: number;
  awaitingApproval: number;
  failed: number;
  sentLast24h: number;
  oldestQueuedMinutes: number | null;
  oldestInProgressMinutes: number | null;
  /** True when the oldest queued email is older than the stale threshold,
   *  i.e. the worker probably isn't running. */
  stale: boolean;
  staleInProgress: boolean;
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
  const [queuedResult, inProgressResult, awaitingResult, failedResult] = await Promise.all([
    scoped("queued"),
    scoped("in_progress"),
    scoped("awaiting_approval"),
    scoped("failed"),
  ]);
  if (queuedResult.error) throw queuedResult.error;
  if (inProgressResult.error) throw inProgressResult.error;
  if (awaitingResult.error) throw awaitingResult.error;
  if (failedResult.error) throw failedResult.error;
  const queued = queuedResult.count;
  const inProgress = inProgressResult.count;
  const awaitingApproval = awaitingResult.count;
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

  let oldestProgressQ = base().select("claimed_at, created_at")
    .eq("status", "in_progress").order("claimed_at", { ascending: true, nullsFirst: true }).limit(1);
  if (companyId) oldestProgressQ = oldestProgressQ.eq("company_id", companyId);
  const { data: oldestProgress, error: oldestProgressError } = await oldestProgressQ;
  if (oldestProgressError) throw oldestProgressError;
  const oldestProgressAt = oldestProgress?.[0]?.claimed_at || oldestProgress?.[0]?.created_at || null;
  const oldestInProgressMinutes = oldestProgressAt
    ? Math.round((Date.now() - new Date(oldestProgressAt).getTime()) / 60000)
    : null;

  return {
    queued: Number(queued || 0),
    inProgress: Number(inProgress || 0),
    awaitingApproval: Number(awaitingApproval || 0),
    failed: Number(failed || 0),
    sentLast24h: Number(sentLast24h || 0),
    oldestQueuedMinutes,
    oldestInProgressMinutes,
    stale: oldestQueuedMinutes != null && oldestQueuedMinutes > STALE_MINUTES,
    staleInProgress: oldestInProgressMinutes != null && oldestInProgressMinutes > STALE_MINUTES,
  };
}
