/**
 * Cron heartbeat. Writes one audit_logs row per cron invocation so the
 * operator can see at a glance whether each scheduled job is firing.
 *
 * Discovered 2026-05-18 that several Vercel-scheduled crons hadn't
 * fired in weeks (exchange_rates last updated 2026-04-27, the entire
 * outgoing_email_queue was stuck at attempts=0 for 5+ days). Without
 * heartbeats there's no DB-visible signal that distinguishes "cron is
 * running and doing nothing" from "cron isn't running at all".
 *
 * Use at the END of each cron handler, just before the response:
 *   await recordCronHeartbeat(supabase, "process-email-queue", "ok", {
 *     sent: 12, failed: 0, source: auth.source,
 *   });
 *
 * Failure path:
 *   await recordCronHeartbeat(supabase, "currency-check", "error", {
 *     error_message: err?.message,
 *   });
 *
 * Querying:
 *   SELECT action, max(created_at), count(*)
 *     FROM audit_logs
 *    WHERE action LIKE 'cron.%'
 *      AND created_at > now() - interval '24 hours'
 *    GROUP BY action
 *    ORDER BY action;
 *
 * Insert is best-effort - a failure here never propagates to the
 * cron's response. We do not want a heartbeat outage to look like a
 * cron outage.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type CronHeartbeatStatus = "ok" | "error";

export async function recordCronHeartbeat(
  supabase: any,
  cronName: string,
  status: CronHeartbeatStatus,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      action: `cron.${cronName}`,
      entity_type: "cron",
      entity_id: cronName,
      metadata: {
        status,
        ...(metadata || {}),
      },
    });
  } catch (e) {
    console.warn(`[cronHeartbeat] failed to record heartbeat for ${cronName}:`, e);
  }
}
