-- Manager "Working / Managing only" mode.
--
-- A kitchen_manager / cleaning_manager is, by default, oversight only:
-- they run the team but do NOT receive the crew task notifications that
-- staff receive, and they are not in the hands-on work pool. When a
-- manager opts in to "Working", they are treated like a staff member for
-- their department (same task notifications, appear in the crew), until
-- they clock out or the day rolls over.
--
-- manager_working        : true while the manager has opted in to work.
-- manager_working_since  : when they opted in; read-time staleness guard
--                          (>18h old is treated as no longer working, so a
--                          flag left on overnight can't keep routing tasks).
-- Reset to (false, null) on clock-out by timeClockService.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_working boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_working_since timestamptz NULL;

-- Fast lookup of "who is a working manager right now" for headcount /
-- assignable-pool queries. Partial index keeps it tiny (only the handful
-- of managers currently opted in).
CREATE INDEX IF NOT EXISTS idx_profiles_manager_working
  ON public.profiles (company_id)
  WHERE manager_working = true;
