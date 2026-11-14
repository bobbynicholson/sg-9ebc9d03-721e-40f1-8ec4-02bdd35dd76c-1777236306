/**
 * Shared cron auth gate.
 *
 * Every endpoint under /api/cron/* should accept either:
 *   1. Vercel Cron: Authorization: Bearer ${CRON_SECRET}
 *   2. An authenticated super_admin session (manual operator trigger
 *      from the browser, e.g. when Vercel's scheduler isn't firing or
 *      when the operator wants to drain a backed-up queue immediately).
 *
 * Use:
 *   const auth = await requireCronAuth(req, res);
 *   if (!auth.ok) return; // 401 already sent
 *   // proceed with cron body. `auth.source` tells you whether this
 *   // was Vercel or a manual trigger - useful for heartbeat metadata.
 *
 * Replaces the ~20-line inlined dual-auth block that was being
 * copy-pasted across cron handlers. Single source of truth so policy
 * changes (e.g. add an org-owner role, accept service-role JWT) land
 * in one place.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import { cronIntervalMs, nextCronRun, scheduledCrons } from "@/lib/cronSchedule";
import { getServiceSupabase } from "@/lib/supabase/service";
import { recordCronIncident, resolveRecoveredCronIncidents } from "@/lib/cronTaskIncidents";

const STUCK_AFTER_MS = 10 * 60 * 1000;

async function beginCronTaskTracking(
  req: NextApiRequest,
  res: NextApiResponse,
  source: CronAuthSource,
): Promise<{ runId: string; startedAt: string } | null> {
  const endpoint = String(req.url || "").split("?")[0];
  const task = scheduledCrons.find((item) => item.path === endpoint);
  if (!task) return null;

  let db: any;
  try {
    db = getServiceSupabase();
  } catch (error: any) {
    console.warn("[cronAuth] task status unavailable:", error?.message || error);
    return null;
  }

  const runId = randomUUID();
  const startedAt = new Date();
  let previousSummary: any = { data: null };
  try {
    previousSummary = await db.from("scheduled_task_status")
      .select("last_run_id, last_status, last_started_at")
      .eq("task_key", task.taskKey)
      .maybeSingle();
  } catch (error: any) {
    console.warn("[cronAuth] previous task status could not be read:", task.taskKey, error?.message || error);
  }

  // Catch incidents even if nobody had the status page open between runs.
  // Keep each prior invocation independent so a fresh run cannot conceal it.
  const stuckCutoff = new Date(startedAt.getTime() - STUCK_AFTER_MS).toISOString();
  let priorRunning: any = { data: [] };
  try {
    priorRunning = await db.from("scheduled_task_runs")
      .select("run_id, started_at")
      .eq("task_key", task.taskKey)
      .eq("status", "running")
      .lt("started_at", stuckCutoff);
  } catch (error: any) {
    console.warn("[cronAuth] prior running tasks could not be checked:", task.taskKey, error?.message || error);
  }
  for (const prior of priorRunning.data || []) {
    const message = `No response was recorded within ${Math.floor(STUCK_AFTER_MS / 60_000)} minutes.`;
    try {
      await db.from("scheduled_task_runs").update({ status: "stuck", error: message, updated_at: startedAt.toISOString() })
        .eq("run_id", prior.run_id).eq("status", "running");
      await recordCronIncident(db, {
        eventKey: `stuck:${prior.run_id}`,
        taskKey: task.taskKey,
        runId: prior.run_id,
        status: "stuck",
        detectedAt: startedAt,
        startedAt: prior.started_at,
        message,
      });
    } catch (error: any) {
      console.warn("[cronAuth] prior stuck run could not be recorded:", task.taskKey, error?.message || error);
    }
  }

  const previous = previousSummary.data;
  if (previous?.last_started_at && previous.last_status !== "running") {
    const expectedNext = nextCronRun(task.schedule, new Date(previous.last_started_at));
    const graceMs = Math.min(30 * 60 * 1000, Math.max(3 * 60 * 1000, cronIntervalMs(task.schedule, startedAt) / 2));
    if (expectedNext && startedAt.getTime() > expectedNext.getTime() + graceMs) {
      const message = `The next scheduled run was due at ${expectedNext.toISOString()} and had not started on time.`;
      try {
        await recordCronIncident(db, {
          eventKey: `overdue:${task.taskKey}:${expectedNext.toISOString()}`,
          taskKey: task.taskKey,
          runId: previous.last_run_id ? String(previous.last_run_id) : null,
          status: "overdue",
          detectedAt: startedAt,
          startedAt: previous.last_started_at,
          message,
        });
      } catch (error: any) {
        console.warn("[cronAuth] overdue run could not be recorded:", task.taskKey, error?.message || error);
      }
    }
  }

  let runWrite: any = { error: null };
  try {
    runWrite = await db.from("scheduled_task_runs").insert({
      run_id: runId,
      task_key: task.taskKey,
      endpoint: task.path,
      schedule: task.schedule,
      status: "running",
      started_at: startedAt.toISOString(),
      trigger_source: source,
      updated_at: startedAt.toISOString(),
    });
  } catch (error: any) {
    runWrite = { error };
  }
  if (runWrite.error) {
    console.warn("[cronAuth] task invocation could not be stored:", task.taskKey, runWrite.error.message);
  }

  let summaryWrite: any = { error: null };
  try {
    summaryWrite = await db.from("scheduled_task_status").upsert({
      task_key: task.taskKey,
      endpoint: task.path,
      schedule: task.schedule,
      last_run_id: runId,
      last_status: "running",
      last_started_at: startedAt.toISOString(),
      last_finished_at: null,
      last_duration_ms: null,
      last_http_status: null,
      last_error: null,
      last_trigger_source: source,
      updated_at: startedAt.toISOString(),
    }, { onConflict: "task_key" });
  } catch (error: any) {
    summaryWrite = { error };
  }
  if (summaryWrite.error) {
    console.warn("[cronAuth] task start summary could not be stored:", task.taskKey, summaryWrite.error.message);
  }
  if (runWrite.error && summaryWrite.error) {
    return null;
  }

  // Each invocation has its own row, so a later overlapping run cannot hide
  // this one if it hangs. Persist completion before ending the HTTP response.
  const originalEnd = res.end.bind(res);
  let responseEnded = false;
  (res as any).end = (...args: any[]) => {
    if (responseEnded) return res;
    responseEnded = true;
    const finishedAt = new Date();
    const httpStatus = Number(res.statusCode || 200);
    const failed = httpStatus >= 400;
    const completion = (async () => {
      let finalStatus: "failed" | "succeeded" = failed ? "failed" : "succeeded";
      let failureMessage = failed ? `Task returned HTTP ${httpStatus}` : "";
      if (!runWrite.error) {
        const runCompletion = await db.from("scheduled_task_runs").update({
          status: failed ? "failed" : "succeeded",
          finished_at: finishedAt.toISOString(),
          duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          http_status: httpStatus,
          error: failed ? `Task returned HTTP ${httpStatus}` : null,
          updated_at: finishedAt.toISOString(),
        }).eq("run_id", runId).eq("status", "running").select("run_id").maybeSingle();
        if (runCompletion.error) {
          console.warn("[cronAuth] task completion status could not be stored:", task.taskKey, runCompletion.error.message);
        }
        if (!runCompletion.data) {
          // recordCronHeartbeat may already have marked a run failed because
          // its batch contained item-level errors despite HTTP 200.
          const currentRun = await db.from("scheduled_task_runs")
            .select("status, error").eq("run_id", runId).maybeSingle();
          if (currentRun.error) {
            console.warn("[cronAuth] final task status could not be read:", task.taskKey, currentRun.error.message);
          } else if (currentRun.data?.status === "failed") {
            finalStatus = "failed";
            failureMessage = currentRun.data.error || "Task reported item-level errors.";
          }
        }
      }
      if (!summaryWrite.error) {
        const summaryResult = await db.from("scheduled_task_status").update({
          last_status: finalStatus,
          last_finished_at: finishedAt.toISOString(),
          last_duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          last_http_status: httpStatus,
          last_error: finalStatus === "failed" ? failureMessage : null,
          updated_at: finishedAt.toISOString(),
        }).eq("task_key", task.taskKey).eq("last_run_id", runId).eq("last_status", "running");
        if (summaryResult.error) {
          console.warn("[cronAuth] task summary completion could not be stored:", task.taskKey, summaryResult.error.message);
        }
      }

      if (finalStatus === "failed") {
        await recordCronIncident(db, {
          eventKey: `failed:${runId}`,
          taskKey: task.taskKey,
          runId,
          status: "failed",
          detectedAt: finishedAt,
          startedAt: startedAt.toISOString(),
          message: failureMessage || `Task returned HTTP ${httpStatus}`,
        });
      } else {
        await resolveRecoveredCronIncidents(db, task.taskKey, runId, finishedAt);
      }
    })();

    let sent = false;
    let timeout: ReturnType<typeof setTimeout>;
    const sendResponse = () => {
      if (sent) return;
      sent = true;
      clearTimeout(timeout);
      originalEnd(...args);
    };
    timeout = setTimeout(sendResponse, 1500);
    void Promise.resolve(completion).catch((updateError: any) => {
      console.warn("[cronAuth] task completion status write failed:", task.taskKey, updateError?.message || updateError);
    }).finally(sendResponse);
    return res;
  };
  return { runId, startedAt: startedAt.toISOString() };
}

export type CronAuthSource = "cron" | "super_admin";

export interface CronAuthOk {
  ok: true;
  source: CronAuthSource;
  runId?: string;
}

export interface CronAuthFail {
  ok: false;
}

// Scheduled callers must use a private CRON_SECRET configured in the deployment.
export async function requireCronAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<CronAuthOk | CronAuthFail> {
  const expected = process.env.CRON_SECRET?.trim() || "";
  const auth = req.headers.authorization || "";
  if (expected && auth === `Bearer ${expected}`) {
    let tracking: { runId: string; startedAt: string } | null = null;
    try {
      tracking = await beginCronTaskTracking(req, res, "cron");
    } catch (error: any) {
      console.warn("[cronAuth] tracking setup failed; allowing scheduled task to continue:", error?.message || error);
    }
    return { ok: true, source: "cron", runId: tracking?.runId };
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (user) {
      const { data: profile } = await ssr
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const role = (profile?.role || "") as string;
      if (role === "super_admin") {
        let tracking: { runId: string; startedAt: string } | null = null;
        try {
          tracking = await beginCronTaskTracking(req, res, "super_admin");
        } catch (error: any) {
          console.warn("[cronAuth] tracking setup failed; allowing manual task to continue:", error?.message || error);
        }
        return { ok: true, source: "super_admin", runId: tracking?.runId };
      }
    }
  } catch {
    // fall through to 401
  }

  res.status(401).json({ error: "Unauthorised" });
  return { ok: false };
}
