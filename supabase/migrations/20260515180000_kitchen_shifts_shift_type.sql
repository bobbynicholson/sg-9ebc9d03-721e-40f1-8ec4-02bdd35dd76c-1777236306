-- Wave 40.4: kitchen_shifts gains a shift_type column so the same
-- table backs both kitchen + cleaning rosters.
--
-- Bobby's brief: at small catering companies, the same person often
-- does kitchen prep AND cleaning AND dishwashing in a single day.
-- They shouldn't have to clock in twice or be rostered on two
-- separate systems. Each person has one login + one dashboard
-- shape; what they DO during a shift is task-level, not shift-level.
--
-- Implementation: keep the existing kitchen_shifts table (don't
-- rename -- too risky), just add a shift_type column. Default to
-- 'kitchen' for back-compat with every existing row + every
-- existing query. New cleaning-side roster inserts pass
-- shift_type='cleaning'. The 'kitchen_and_cleaning' value is for
-- combined shifts where one person covers both roles in one go --
-- the surface code can decide how to display it.
--
-- The unique-per-day constraint widens to include shift_type so a
-- staffer can technically have a kitchen shift AND a cleaning shift
-- on the same day (e.g. cooks 8-12, cleans 13-17 -- two distinct
-- shifts). For combined-day people, use the 'kitchen_and_cleaning'
-- value on a single row.

ALTER TABLE public.kitchen_shifts
  ADD COLUMN IF NOT EXISTS shift_type TEXT NOT NULL DEFAULT 'kitchen'
    CHECK (shift_type IN ('kitchen', 'cleaning', 'kitchen_and_cleaning', 'general'));

-- Drop the old single-per-day unique index, replace with one that
-- includes shift_type. Use IF EXISTS / IF NOT EXISTS so the
-- migration is safe to re-run.
DROP INDEX IF EXISTS public.kitchen_shifts_one_per_chef_per_day;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_shifts_one_per_role_per_day
  ON public.kitchen_shifts (staff_id, shift_date, shift_type)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.kitchen_shifts.shift_type IS
  'kitchen | cleaning | kitchen_and_cleaning | general. Lets the same table back rostering for kitchen + cleaning teams without parallel infra.';
