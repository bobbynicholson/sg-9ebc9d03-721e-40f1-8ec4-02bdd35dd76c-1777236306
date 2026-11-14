/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireActiveApiProfile } from "@/lib/requireActiveApiProfile";
import { getServiceSupabase } from "@/lib/supabase/service";
import { cronIntervalMs, nextCronRun, scheduledCrons } from "@/lib/cronSchedule";
import { recordCronIncident, recordCronIncidents } from "@/lib/cronTaskIncidents";
import { withApiLogging } from "@/lib/withApiLogging";

const ADMIN_ROLES = new Set(["super_admin", "owner", "company_admin", "admin"]);
const STUCK_AFTER_MS = 10 * 60 * 1000;

function auditFailureSummary(details: any): string | null {
  if (details?.status !== "error") return null;
  const clean = (value: unknown) => String(value || "")
    .replace(/https?:\/\/\S+/gi, "[provider URL]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted token]")
    .slice(0, 280);
  if (details.error_message) return clean(details.error_message);
  const nestedErrors = Array.isArray(details.details)
    ? details.details.filter((item: any) => item?.error).map((item: any) => clean(item.error))
    : [];
  const itemErrors = Array.isArray(details.item_errors)
    ? details.item_errors.map(clean)
    : [];
  const errors = nestedErrors.length ? nestedErrors : itemErrors;
  if (errors.length) {
    const unique = Array.from(new Set(errors));
    const total = Number(details.errors_count || unique.length);
    const truncated = Number(details.item_errors_truncated || 0);
    return `${total} item${total === 1 ? "" : "s"} failed: ${unique[0]}${unique.length > 1 ? ` (+${unique.length - 1} other errors)` : truncated ? ` (+${truncated} more not shown)` : ""}`;
  }
  if (Number(details.errors_count || 0) > 0) {
    return `${details.errors_count} item${details.errors_count === 1 ? "" : "s"} reported errors; inspect the Vercel function log for details.`;
  }
  return "Task recorded an error; inspect the Vercel function log for details.";
}

function safeMessage(value: unknown) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "[provider URL]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted token]")
    .slice(0, 500);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const actor = await requireActiveApiProfile(req, res, ADMIN_ROLES);
  if (!actor) return;

  try {
    const db: any = getServiceSupabase();
    const taskKeys = scheduledCrons.map((task) => task.taskKey);
    let exceptionQuery: any = null;
    if (actor.role === "super_admin") {
      exceptionQuery = db.from("payfast_recovery_exceptions")
        .select("id, company_id, provider_transaction_id, reason, attempt_count, first_seen_at, last_seen_at")
        .eq("status", "pending").order("first_seen_at", { ascending: true }).limit(100);
    } else if (actor.profile.company_id) {
      exceptionQuery = db.from("payfast_recovery_exceptions")
        .select("id, company_id, provider_transaction_id, reason, attempt_count, first_seen_at, last_seen_at")
        .eq("company_id", actor.profile.company_id).eq("status", "pending")
        .order("first_seen_at", { ascending: true }).limit(100);
    }

    const [statusResult, auditResult, failureResult, runningResult, incidentResult, exceptionResult] = await Promise.all([
      db.from("scheduled_task_status")
        .select("task_key, endpoint, schedule, last_run_id, last_status, last_started_at, last_finished_at, last_duration_ms, last_http_status, last_error, last_trigger_source"),
      db.rpc("latest_cron_audit_status", {
        task_actions: taskKeys.map((taskKey) => `cron.${taskKey}`),
      }),
      db.rpc("cron_audit_failures", {
        task_actions: taskKeys.map((taskKey) => `cron.${taskKey}`),
      }),
      db.from("scheduled_task_runs")
        .select("run_id, task_key, started_at, status")
        .eq("status", "running")
        .in("task_key", taskKeys)
        .order("started_at", { ascending: true })
        .limit(2000),
      db.from("scheduled_task_incidents")
        .select("incident_id, event_key, task_key, run_id, incident_status, detected_at, started_at, message, resolved_at, recovered_by_run_id")
        .in("task_key", taskKeys)
        .order("detected_at", { ascending: false })
        .limit(2000),
      exceptionQuery || Promise.resolve({ data: [], error: null }),
    ]);
    if (statusResult.error) throw statusResult.error;
    if (failureResult.error) throw failureResult.error;
    if (runningResult.error) throw runningResult.error;
    if (incidentResult.error) throw incidentResult.error;
    if (auditResult.error) throw auditResult.error;
    if (exceptionResult.error) throw exceptionResult.error;

    const now = new Date();
    const statusByTask = new Map<string, any>((statusResult.data || []).map((row: any) => [row.task_key, row]));
    const legacyByTask = new Map<string, any>();
    for (const row of auditResult.data || []) {
      const key = String(row.action || "").replace(/^cron\./, "");
      if (!legacyByTask.has(key)) legacyByTask.set(key, row);
    }
    const incidents = [...(incidentResult.data || [])];
    const incidentKeys = new Set(incidents.map((incident: any) => incident.event_key));

    // Backfill every failed heartbeat, including failures followed by a later
    // successful run. Heartbeat rows predating run IDs are correlated to the
    // latest invocation when their timestamps prove they belong to it.
    const auditIncidentsToInsert: Array<{
      eventKey: string;
      taskKey: string;
      runId: string | null;
      status: "failed";
      detectedAt: Date;
      startedAt: string | null;
      message: string;
      resolvedAt: string | null;
      recoveredByRunId: string | null;
    }> = [];
    const recoveriesByTask = new Map<string, { eventKeys: string[]; at: string; runId: string }>();
    for (const audit of failureResult.data || []) {
      const taskKey = String(audit.action || "").replace(/^cron\./, "");
      if (!taskKeys.includes(taskKey)) continue;
      const current = statusByTask.get(taskKey);
      const details = audit.details || {};
      const currentRunMatches = Boolean(
        current?.last_run_id && current.last_started_at && audit.created_at
        && new Date(audit.created_at).getTime() >= new Date(current.last_started_at).getTime(),
      );
      const runId = details.run_id || (currentRunMatches ? String(current.last_run_id) : null);
      const eventKey = runId
        ? `failed:${runId}`
        : `failed:audit:${taskKey}:${String(audit.created_at || "unknown")}`;
      const message = auditFailureSummary(details) || "Task recorded an error; inspect the Vercel function log for details.";
      const recoveredAfterFailure = Boolean(
        current?.last_status === "succeeded" && current.last_run_id
        && current.last_finished_at && audit.created_at
        && String(current.last_run_id) !== String(runId || "")
        && new Date(current.last_finished_at).getTime() > new Date(audit.created_at).getTime(),
      );
      const resolvedAt = recoveredAfterFailure ? current.last_finished_at : null;
      if (resolvedAt) {
        const recovery = recoveriesByTask.get(taskKey) || {
          eventKeys: [],
          at: resolvedAt,
          runId: String(current.last_run_id),
        };
        recovery.eventKeys.push(eventKey);
        recoveriesByTask.set(taskKey, recovery);
      }

      if (!incidentKeys.has(eventKey)) {
        auditIncidentsToInsert.push({
          eventKey,
          taskKey,
          runId,
          status: "failed",
          detectedAt: audit.created_at ? new Date(audit.created_at) : now,
          startedAt: details.run_started_at || (currentRunMatches ? current.last_started_at : null),
          message,
          resolvedAt,
          recoveredByRunId: resolvedAt ? String(current.last_run_id) : null,
        });
        incidentKeys.add(eventKey);
      }
      if (!incidents.some((incident: any) => incident.event_key === eventKey)) {
        incidents.push({
          incident_id: eventKey,
          event_key: eventKey,
          task_key: taskKey,
          run_id: runId,
          incident_status: "failed",
          detected_at: audit.created_at || now.toISOString(),
          started_at: details.run_started_at || (currentRunMatches ? current.last_started_at : null),
          message,
          resolved_at: resolvedAt,
          recovered_by_run_id: resolvedAt ? current.last_run_id : null,
        });
      }
    }
    await recordCronIncidents(db, auditIncidentsToInsert);
    for (const [taskKey, recovery] of recoveriesByTask) {
      const { error } = await db.from("scheduled_task_incidents").update({
        resolved_at: recovery.at,
        recovered_by_run_id: recovery.runId,
      }).eq("task_key", taskKey).in("event_key", recovery.eventKeys).is("resolved_at", null);
      if (error) throw error;
      for (const incident of incidents) {
        if (recovery.eventKeys.includes(incident.event_key) && !incident.resolved_at) {
          incident.resolved_at = recovery.at;
          incident.recovered_by_run_id = recovery.runId;
        }
      }
    }

    const recentlyStuck = (runningResult.data || []).filter((run: any) =>
      now.getTime() - new Date(run.started_at).getTime() > STUCK_AFTER_MS,
    );

    // Record every stale invocation independently. This catches a run that was
    // hidden when a later scheduled invocation updated the summary row.
    for (const run of recentlyStuck) {
      const eventKey = `stuck:${run.run_id}`;
      const started = new Date(run.started_at);
      const message = `No response was recorded within ${Math.floor(STUCK_AFTER_MS / 60_000)} minutes.`;
      await db.from("scheduled_task_runs").update({
        status: "stuck",
        error: message,
        updated_at: now.toISOString(),
      }).eq("run_id", run.run_id).eq("status", "running");
      await recordCronIncident(db, {
        eventKey,
        taskKey: run.task_key,
        runId: run.run_id,
        status: "stuck",
        detectedAt: now,
        startedAt: started.toISOString(),
        message,
      });
      if (!incidentKeys.has(eventKey)) {
        incidentKeys.add(eventKey);
        incidents.unshift({
          incident_id: eventKey,
          event_key: eventKey,
          task_key: run.task_key,
          run_id: run.run_id,
          incident_status: "stuck",
          detected_at: now.toISOString(),
          started_at: started.toISOString(),
          message,
          resolved_at: null,
          recovered_by_run_id: null,
        });
      }
    }

    const computed: any[] = [];
    for (const definition of scheduledCrons) {
      const current = statusByTask.get(definition.taskKey);
      const legacy = legacyByTask.get(definition.taskKey);
      const legacyDetails = legacy?.details || {};
      const legacyBelongsToCurrentRun = !current || Boolean(
        legacy?.created_at && current.last_started_at
        && new Date(legacy.created_at).getTime() >= new Date(current.last_started_at).getTime(),
      );
      const currentAuditError = legacyBelongsToCurrentRun ? auditFailureSummary(legacyDetails) : null;
      const recordedStatus = current?.last_status || (legacy
        ? (legacyDetails.status === "error" ? "failed" : "succeeded")
        : "never_run");
      const lastStartedAt = current?.last_started_at || legacy?.created_at || null;
      const lastFinishedAt = current?.last_finished_at || legacy?.created_at || null;
      const expectedNext = lastStartedAt
        ? nextCronRun(definition.schedule, new Date(lastStartedAt))
        : null;
      const graceMs = Math.min(30 * 60 * 1000, Math.max(3 * 60 * 1000, cronIntervalMs(definition.schedule, now) / 2));
      const isOverdue = Boolean(expectedNext && now.getTime() > expectedNext.getTime() + graceMs);
      const overdueKey = expectedNext ? `overdue:${definition.taskKey}:${expectedNext.toISOString()}` : null;
      const latestRunIsRunning = recordedStatus === "running";
      const detectedIncidents: any[] = [];

      if (currentAuditError) {
        const runId = current?.last_run_id ? String(current.last_run_id) : null;
        const eventKey = runId
          ? `failed:${runId}`
          : `failed:legacy:${definition.taskKey}:${String(legacy?.created_at || "unknown")}`;
        detectedIncidents.push({
          event_key: eventKey,
          task_key: definition.taskKey,
          run_id: runId,
          incident_status: "failed",
          detected_at: legacy?.created_at || now.toISOString(),
          started_at: lastStartedAt,
          message: currentAuditError,
          resolved_at: null,
          recovered_by_run_id: null,
        });
        if (!incidentKeys.has(eventKey)) {
          await recordCronIncident(db, {
            eventKey,
            taskKey: definition.taskKey,
            runId,
            status: "failed",
            detectedAt: legacy?.created_at ? new Date(legacy.created_at) : now,
            startedAt: lastStartedAt,
            message: currentAuditError,
          });
          incidentKeys.add(eventKey);
        }
      }

      if (isOverdue && !latestRunIsRunning && overdueKey && !incidentKeys.has(overdueKey)) {
        const message = `The next scheduled run was due at ${expectedNext!.toISOString()} and has not started.`;
        await recordCronIncident(db, {
          eventKey: overdueKey,
          taskKey: definition.taskKey,
          runId: current?.last_run_id ? String(current.last_run_id) : null,
          status: "overdue",
          detectedAt: now,
          startedAt: lastStartedAt,
          message,
        });
        incidentKeys.add(overdueKey);
        detectedIncidents.push({
          event_key: overdueKey,
          task_key: definition.taskKey,
          run_id: current?.last_run_id || null,
          incident_status: "overdue",
          detected_at: now.toISOString(),
          started_at: lastStartedAt,
          message,
          resolved_at: null,
          recovered_by_run_id: null,
        });
      }

      computed.push({
        definition,
        current,
        legacy,
        legacyDetails,
        currentAuditError,
        recordedStatus,
        lastStartedAt,
        lastFinishedAt,
        expectedNext,
        isOverdue,
        overdueKey,
        latestRunIsRunning,
        detectedIncidents,
      });
    }

    // Include incidents discovered during this request, and keep a useful
    // bounded history on each task card for quick recovery checks.
    const incidentsByTask = new Map<string, any[]>();
    for (const incident of [...incidents, ...computed.flatMap((item) => item.detectedIncidents)]) {
      const list = incidentsByTask.get(incident.task_key) || [];
      if (!list.some((item) => item.event_key === incident.event_key)) list.push(incident);
      incidentsByTask.set(incident.task_key, list);
    }

    const tasks = computed.map((item) => {
      const {
        definition, current, legacyDetails, currentAuditError, recordedStatus,
        lastStartedAt, lastFinishedAt, expectedNext, isOverdue, overdueKey,
        latestRunIsRunning,
      } = item;
      const taskIncidents = (incidentsByTask.get(definition.taskKey) || [])
        .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
      const openIncidents = taskIncidents.filter((incident) => !incident.resolved_at);
      const hasStuckRun = openIncidents.some((incident) => incident.incident_status === "stuck");
      const hasFailure = openIncidents.some((incident) => incident.incident_status === "failed");
      const hasOverdueIncident = openIncidents.some((incident) => incident.incident_status === "overdue");
      const isCurrentRunStuck = latestRunIsRunning && Boolean(lastStartedAt)
        && now.getTime() - new Date(lastStartedAt).getTime() > STUCK_AFTER_MS;
      const lastStatus = currentAuditError ? "failed" : recordedStatus;
      const status = hasStuckRun || isCurrentRunStuck
        ? "stuck"
        : lastStatus === "failed" || hasFailure
          ? "failed"
          : hasOverdueIncident || (isOverdue && !latestRunIsRunning)
            ? "overdue"
            : lastStatus;
      const statusIncident = openIncidents.find((incident) => incident.incident_status === status);
      const lastError = currentAuditError
        || current?.last_error
        || (!current ? auditFailureSummary(legacyDetails) : null)
        || statusIncident?.message
        || null;
      const stuckAt = openIncidents.find((incident) => incident.incident_status === "stuck");

      return {
        ...definition,
        status,
        lastRunStatus: lastStatus,
        lastStartedAt,
        lastFinishedAt,
        lastDurationMs: current?.last_duration_ms ?? legacyDetails.duration_ms ?? null,
        lastHttpStatus: current?.last_http_status ?? null,
        lastError: lastError || (hasStuckRun ? stuckAt?.message : null),
        lastTriggerSource: current?.last_trigger_source || legacyDetails.source || null,
        nextRunAt: nextCronRun(definition.schedule, now)?.toISOString() || null,
        overdueByMinutes: isOverdue && expectedNext
          ? Math.max(1, Math.floor((now.getTime() - expectedNext.getTime()) / 60_000))
          : 0,
        stuckForMinutes: isCurrentRunStuck && lastStartedAt
          ? Math.floor((now.getTime() - new Date(lastStartedAt).getTime()) / 60_000)
          : stuckAt?.started_at
            ? Math.floor((now.getTime() - new Date(stuckAt.started_at).getTime()) / 60_000)
            : 0,
        openIncidentCount: openIncidents.length,
        incidents: taskIncidents.slice(0, 10).map((incident) => ({
          status: incident.incident_status,
          detectedAt: incident.detected_at,
          startedAt: incident.started_at,
          message: safeMessage(incident.message),
          resolvedAt: incident.resolved_at,
          runId: incident.run_id,
        })),
      };
    });

    const payfastExceptions = (exceptionResult.data || []).map((row: any) => ({
      id: row.id,
      transactionId: String(row.provider_transaction_id || "").slice(0, 100),
      reason: safeMessage(row.reason),
      attempts: Number(row.attempt_count || 0),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    }));
    return res.status(200).json({
      ok: true,
      checkedAt: now.toISOString(),
      timezone: "UTC",
      tasks,
      payfastExceptions,
    });
  } catch (error: any) {
    console.error("[admin/cron-task-status] lookup failed:", error?.message || error);
    return res.status(503).json({ error: "Scheduled task status could not be loaded." });
  }
}

export default withApiLogging(handler);
