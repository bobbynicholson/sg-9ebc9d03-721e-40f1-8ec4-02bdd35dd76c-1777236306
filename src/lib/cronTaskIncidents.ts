/* eslint-disable @typescript-eslint/no-explicit-any */

export type CronIncidentStatus = "failed" | "stuck" | "overdue";

export async function recordCronIncident(
  db: any,
  incident: CronIncidentWrite,
) {
  return recordCronIncidents(db, [incident]);
}

export type CronIncidentWrite = {
    eventKey: string;
    taskKey: string;
    runId: string | null;
    status: CronIncidentStatus;
    detectedAt: Date;
    startedAt: string | null;
    message: string;
    resolvedAt?: string | null;
    recoveredByRunId?: string | null;
  };

export async function recordCronIncidents(db: any, incidentList: CronIncidentWrite[]) {
  if (incidentList.length === 0) return;
  const rows = incidentList.map((incident) => ({
    event_key: incident.eventKey,
    task_key: incident.taskKey,
    run_id: incident.runId,
    incident_status: incident.status,
    detected_at: incident.detectedAt.toISOString(),
    started_at: incident.startedAt,
    message: incident.message.slice(0, 500),
    resolved_at: incident.resolvedAt || null,
    recovered_by_run_id: incident.recoveredByRunId || null,
  }));
  for (let index = 0; index < rows.length; index += 250) {
    const { error } = await db.from("scheduled_task_incidents")
      .upsert(rows.slice(index, index + 250), { onConflict: "event_key", ignoreDuplicates: true });
    if (error) throw error;
  }
}

export async function resolveRecoveredCronIncidents(
  db: any,
  taskKey: string,
  successfulRunId: string,
  recoveredAt: Date,
) {
  const recovery = {
    resolved_at: recoveredAt.toISOString(),
    recovered_by_run_id: successfulRunId,
  };
  const [resolvedFailures, resolvedStuckRun] = await Promise.all([
    db.from("scheduled_task_incidents").update(recovery)
      .eq("task_key", taskKey)
      .in("incident_status", ["failed", "overdue"])
      .is("resolved_at", null)
      .lt("detected_at", recoveredAt.toISOString()),
    // A successful overlapping run does not prove that another still-running
    // invocation recovered. Resolve a stuck incident only if that same run ends.
    db.from("scheduled_task_incidents").update(recovery)
      .eq("task_key", taskKey)
      .eq("run_id", successfulRunId)
      .eq("incident_status", "stuck")
      .is("resolved_at", null),
  ]);
  if (resolvedFailures.error) throw resolvedFailures.error;
  if (resolvedStuckRun.error) throw resolvedStuckRun.error;
}
