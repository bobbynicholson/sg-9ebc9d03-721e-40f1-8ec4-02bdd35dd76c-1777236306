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
 *   SELECT action, max(created_at), count(*), max(details::text) AS last_meta
 *     FROM audit_logs
 *    WHERE action LIKE 'cron.%'
 *      AND created_at > now() - interval '24 hours'
 *    GROUP BY action
 *    ORDER BY action;
 *
 * Schema gotchas (audit_logs):
 *   - The jsonb column is `details`, not `metadata`. Earlier versions
 *     of this helper wrote `metadata` and failed silently because the
 *     supabase-js insert error was caught and swallowed.
 *   - `entity_id` is a uuid column - cannot hold a cron name string.
 *     We leave it null and put the cron name in details so the row
 *     inserts cleanly.
 *
 * Insert is best-effort - a failure here never propagates to the
 * cron's response. We do not want a heartbeat outage to look like a
 * cron outage. But we DO log the error to console so the next
 * operator looking at function logs sees why heartbeats stopped.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TablesInsert } from "@/integrations/supabase/types";
import { recordCronIncident } from "@/lib/cronTaskIncidents";

export type CronHeartbeatStatus = "ok" | "error";

/**
 * Typed insert shape for the heartbeat row. Sourced from the
 * Supabase-generated types so a schema migration that renames
 * `details` (or changes `entity_type` from required to nullable,
 * etc.) fails compilation here rather than silently failing at
 * runtime - which was exactly the PR #33 incident.
 */
type AuditLogInsert = TablesInsert<"audit_logs">;

export async function recordCronHeartbeat(
  supabase: any,
  cronName: string,
  status: CronHeartbeatStatus,
  metadata?: Record<string, any>,
): Promise<void> {
  let runContext: Record<string, string> = {};
  try {
    let runQuery = supabase.from("scheduled_task_runs")
      .select("run_id, started_at")
      .eq("task_key", cronName);
    if (typeof metadata?.run_id === "string" && metadata.run_id) {
      runQuery = runQuery.eq("run_id", metadata.run_id);
    } else {
      runQuery = runQuery.eq("status", "running").order("started_at", { ascending: false }).limit(1);
    }
    const { data } = await runQuery.maybeSingle();
    if (data?.run_id) {
      runContext = { run_id: data.run_id, run_started_at: data.started_at };
    }
  } catch {
    // The heartbeat remains useful if the task run table is not available.
  }

  // Build the payload through the generated insert type. If the
  // audit_logs schema drifts (column renamed, removed, retyped), the
  // type-check below fails compile-time instead of silently breaking
  // every cron's telemetry at runtime.
  const payload: AuditLogInsert = {
    action: `cron.${cronName}`,
    entity_type: "cron",
    details: {
      cron_name: cronName,
      status,
      ...runContext,
      ...(metadata || {}),
    },
  };

  try {
    const { error } = await supabase.from("audit_logs").insert(payload);
    if (error) {
      console.warn(`[cronHeartbeat] insert error for ${cronName}:`, error);
    }
  } catch (e) {
    console.warn(`[cronHeartbeat] threw recording heartbeat for ${cronName}:`, e);
  }

  // A handler may correctly return HTTP 200 after processing its batch even
  // when some individual records failed. Preserve that task-level failure in
  // the run monitor so a healthy HTTP response cannot hide failed work.
  if (status === "error" && runContext.run_id) {
    const finishedAt = new Date();
    const detail = typeof metadata?.error_message === "string"
      ? metadata.error_message
      : Array.isArray(metadata?.item_errors) && metadata.item_errors.length
        ? metadata.item_errors.join(" | ")
        : Array.isArray(metadata?.details) && metadata.details.some((item: any) => item?.error)
          ? metadata.details.filter((item: any) => item?.error).map((item: any) => item.error).join(" | ")
        : Array.isArray(metadata?.errors) && metadata.errors.length
          ? metadata.errors.join(" | ")
        : metadata?.errors_count
          ? `${metadata.errors_count} item(s) failed.`
          : "Task reported an error in its cron heartbeat.";
    const errorMessage = String(detail).slice(0, 500);
    const startedAt = Date.parse(runContext.run_started_at || "");
    try {
      const { data: failedRun, error: runError } = await supabase.from("scheduled_task_runs")
        .update({
          status: "failed",
          finished_at: finishedAt.toISOString(),
          duration_ms: Number.isFinite(startedAt) ? Math.max(0, finishedAt.getTime() - startedAt) : null,
          http_status: null,
          error: errorMessage,
          updated_at: finishedAt.toISOString(),
        })
        .eq("run_id", runContext.run_id)
        .eq("status", "running")
        .select("run_id")
        .maybeSingle();
      if (runError) throw runError;
      if (failedRun) {
        const { error: summaryError } = await supabase.from("scheduled_task_status")
          .update({
            last_status: "failed",
            last_finished_at: finishedAt.toISOString(),
            last_duration_ms: Number.isFinite(startedAt) ? Math.max(0, finishedAt.getTime() - startedAt) : null,
            last_http_status: null,
            last_error: errorMessage,
            updated_at: finishedAt.toISOString(),
          })
          .eq("task_key", cronName)
          .eq("last_run_id", runContext.run_id)
          .eq("last_status", "running");
        if (summaryError) throw summaryError;
        await recordCronIncident(supabase, {
          eventKey: `failed:${runContext.run_id}`,
          taskKey: cronName,
          runId: runContext.run_id,
          status: "failed",
          detectedAt: finishedAt,
          startedAt: runContext.run_started_at,
          message: errorMessage,
        });
      }
    } catch (e) {
      console.warn(`[cronHeartbeat] run failure status could not be recorded for ${cronName}:`, e);
    }
  }
}
