-- Persist the latest run state for every Vercel-scheduled API task.
-- Run IDs keep overlapping invocations from overwriting the newest status.
CREATE TABLE IF NOT EXISTS public.scheduled_task_status (
  task_key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  schedule TEXT NOT NULL,
  last_run_id UUID NOT NULL,
  last_status TEXT NOT NULL DEFAULT 'running'
    CHECK (last_status IN ('running', 'succeeded', 'failed')),
  last_started_at TIMESTAMPTZ NOT NULL,
  last_finished_at TIMESTAMPTZ,
  last_duration_ms INTEGER,
  last_http_status INTEGER,
  last_error TEXT,
  last_trigger_source TEXT NOT NULL CHECK (last_trigger_source IN ('cron', 'super_admin')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_task_status_state_idx
  ON public.scheduled_task_status(last_status, last_started_at DESC);

-- Keep a row for every invocation. The summary row above is convenient for
-- the dashboard; this log ensures a later run cannot hide an older run that
-- is still running or became stuck between checks.
CREATE TABLE IF NOT EXISTS public.scheduled_task_runs (
  run_id UUID PRIMARY KEY,
  task_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  schedule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'stuck')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  http_status INTEGER,
  error TEXT,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('cron', 'super_admin')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_task_runs_task_started_idx
  ON public.scheduled_task_runs(task_key, started_at DESC);
CREATE INDEX IF NOT EXISTS scheduled_task_runs_running_idx
  ON public.scheduled_task_runs(started_at)
  WHERE status = 'running';

-- Incidents are retained after recovery. event_key makes polling idempotent:
-- one failure/stuck/overdue event per run or missed schedule occurrence.
CREATE TABLE IF NOT EXISTS public.scheduled_task_incidents (
  incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  task_key TEXT NOT NULL,
  run_id UUID,
  incident_status TEXT NOT NULL CHECK (incident_status IN ('failed', 'stuck', 'overdue')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  message TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  recovered_by_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_task_incidents_task_detected_idx
  ON public.scheduled_task_incidents(task_key, detected_at DESC);
CREATE INDEX IF NOT EXISTS scheduled_task_incidents_open_idx
  ON public.scheduled_task_incidents(task_key, detected_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.scheduled_task_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_task_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_task_incidents ENABLE ROW LEVEL SECURITY;
-- Status is read through a role-checked API and written only by the server.

-- Existing cronHeartbeat entries predate this table. This service-role-only
-- function exposes each task's latest historical heartbeat to the admin API
-- until its next invocation records a live status row.
CREATE OR REPLACE FUNCTION public.latest_cron_audit_status(task_actions TEXT[])
RETURNS TABLE(action TEXT, created_at TIMESTAMPTZ, details JSONB)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (logs.action) logs.action, logs.created_at, logs.details
  FROM public.audit_logs logs
  WHERE logs.action = ANY(task_actions)
  ORDER BY logs.action, logs.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.latest_cron_audit_status(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.latest_cron_audit_status(TEXT[]) TO service_role;

-- Return failed heartbeats as well as the latest heartbeat. A later healthy
-- run must not make a failure disappear before an operator opens the monitor.
CREATE OR REPLACE FUNCTION public.cron_audit_failures(task_actions TEXT[])
RETURNS TABLE(action TEXT, created_at TIMESTAMPTZ, details JSONB)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT logs.action, logs.created_at, logs.details
  FROM public.audit_logs logs
  WHERE logs.action = ANY(task_actions)
    AND logs.details->>'status' = 'error'
  ORDER BY logs.created_at DESC
  LIMIT 5000;
$$;

REVOKE ALL ON FUNCTION public.cron_audit_failures(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_audit_failures(TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';
