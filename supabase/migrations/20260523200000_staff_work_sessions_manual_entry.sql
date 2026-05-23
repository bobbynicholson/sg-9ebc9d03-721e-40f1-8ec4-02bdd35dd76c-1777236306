-- STH-C (staff-hours deferred, 2026-05-23): manual-offline-shift
-- entry on /admin/staff-hours.
--
-- The tablet clock-in flow occasionally fails (battery, offline,
-- forgot-to-clock) and the manager needs to record the shift after
-- the fact. Pre-STH-C the page was read-only; the only way to log
-- a missed shift was via the kitchen tablet (which can't go back in
-- time) or by manually entering a staff_work_sessions row at the
-- DB level.
--
-- Schema:
--   entered_manually   true when a manager backfilled this row from
--                      the admin UI (not from a tablet clock-in)
--   entered_by_user_id auth.users.id of the manager who recorded it
--   entry_reason       short text - "forgot to clock out", "tablet
--                      offline", "manual reconciliation", etc.
--
-- These columns are nullable on existing rows since every legacy
-- session was tablet-clocked.

ALTER TABLE public.staff_work_sessions
  ADD COLUMN IF NOT EXISTS entered_manually boolean NOT NULL DEFAULT false;

ALTER TABLE public.staff_work_sessions
  ADD COLUMN IF NOT EXISTS entered_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.staff_work_sessions
  ADD COLUMN IF NOT EXISTS entry_reason text;

COMMENT ON COLUMN public.staff_work_sessions.entered_manually IS
  'STH-C: true when the row was backfilled via the admin UI on /admin/staff-hours, false (default) for tablet clock-in / clock-out events. Surfaces a "Manual" chip on the session row so payroll can audit which ones were not real clock-ins.';

COMMENT ON COLUMN public.staff_work_sessions.entered_by_user_id IS
  'STH-C: auth user id of the manager who backfilled this session. NULL on every tablet-clocked row.';

COMMENT ON COLUMN public.staff_work_sessions.entry_reason IS
  'STH-C: free-text reason the manager gave when backfilling. Examples: "forgot to clock out", "tablet offline", "double-shift forgot".';

CREATE INDEX IF NOT EXISTS idx_staff_work_sessions_company_manual
  ON public.staff_work_sessions (company_id, entered_manually)
  WHERE entered_manually = true;
