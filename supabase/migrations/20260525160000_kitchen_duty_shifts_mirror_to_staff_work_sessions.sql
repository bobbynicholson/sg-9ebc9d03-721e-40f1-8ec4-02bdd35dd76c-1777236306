-- HRS-A: kitchen hours fork unification.
--
-- Pre-fix: chef clocks in on /team-portal/kitchen/duty -> tablet
-- writes kitchen_duty_shifts. /admin/wages reads staff_work_sessions
-- (via timeClockService). Same shift, two tables, no sync. A chef's
-- tablet hours never landed on the wages roll-up unless an admin
-- manually backfilled via /admin/staff-hours.
--
-- This trigger fires when a kitchen_duty_shifts row is closed
-- (is_active flips false AND shift_end stamped) and mirrors it
-- into staff_work_sessions with entered_manually=false +
-- entry_reason='kitchen_duty_shifts mirror'. /admin/kitchen-settlement
-- continues to read kitchen_duty_shifts as the canonical kitchen
-- pay source. /admin/wages reads staff_work_sessions and now sees
-- every kitchen-tablet hour automatically.
--
-- SECURITY DEFINER so the trigger can write to staff_work_sessions
-- regardless of the calling user's RLS context.

CREATE OR REPLACE FUNCTION public.mirror_kitchen_duty_to_staff_work_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_worked_min  int;
  v_total_hours numeric;
  v_session_date date;
BEGIN
  -- Only fire when the shift has been closed (is_active false + shift_end set).
  IF NEW.is_active IS DISTINCT FROM FALSE THEN RETURN NEW; END IF;
  IF NEW.shift_end IS NULL OR NEW.shift_start IS NULL THEN RETURN NEW; END IF;
  IF NEW.staff_id IS NULL OR NEW.company_id IS NULL THEN RETURN NEW; END IF;

  v_worked_min := GREATEST(
    0,
    EXTRACT(EPOCH FROM (NEW.shift_end - NEW.shift_start))::int / 60 - COALESCE(NEW.total_break_min, 0)
  );
  v_total_hours := ROUND(v_worked_min::numeric / 60.0, 2);
  v_session_date := (NEW.shift_end AT TIME ZONE 'Africa/Johannesburg')::date;

  -- Idempotent upsert keyed on (staff_id, clock_in). A re-trigger
  -- (e.g. correction to total_break_min) updates the existing row
  -- instead of duplicating.
  INSERT INTO public.staff_work_sessions (
    staff_id, company_id, clock_in, clock_out, total_hours,
    session_date, entered_manually, entry_reason
  ) VALUES (
    NEW.staff_id, NEW.company_id, NEW.shift_start, NEW.shift_end, v_total_hours,
    v_session_date, false, 'kitchen_duty_shifts mirror'
  )
  ON CONFLICT (staff_id, clock_in) DO UPDATE
  SET clock_out    = EXCLUDED.clock_out,
      total_hours  = EXCLUDED.total_hours,
      session_date = EXCLUDED.session_date,
      updated_at   = now();
  RETURN NEW;
END;
$$;

-- staff_work_sessions needs a unique constraint to support the
-- ON CONFLICT clause above. Add it idempotently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='staff_work_sessions'
      AND indexname='staff_work_sessions_staff_clock_in_key'
  ) THEN
    CREATE UNIQUE INDEX staff_work_sessions_staff_clock_in_key
      ON public.staff_work_sessions (staff_id, clock_in);
  END IF;
END
$$;

DROP TRIGGER IF EXISTS tg_kitchen_duty_shifts_mirror ON public.kitchen_duty_shifts;
CREATE TRIGGER tg_kitchen_duty_shifts_mirror
AFTER INSERT OR UPDATE OF is_active, shift_end, total_break_min
ON public.kitchen_duty_shifts
FOR EACH ROW
EXECUTE FUNCTION public.mirror_kitchen_duty_to_staff_work_session();

-- Backfill: mirror every already-closed kitchen_duty_shifts row.
INSERT INTO public.staff_work_sessions (
  staff_id, company_id, clock_in, clock_out, total_hours,
  session_date, entered_manually, entry_reason
)
SELECT
  s.staff_id,
  s.company_id,
  s.shift_start,
  s.shift_end,
  ROUND((GREATEST(0, EXTRACT(EPOCH FROM (s.shift_end - s.shift_start))::int / 60 - COALESCE(s.total_break_min, 0))::numeric) / 60.0, 2),
  (s.shift_end AT TIME ZONE 'Africa/Johannesburg')::date,
  false,
  'kitchen_duty_shifts mirror (backfill)'
FROM public.kitchen_duty_shifts s
WHERE s.is_active = false
  AND s.shift_end IS NOT NULL
  AND s.shift_start IS NOT NULL
  AND s.staff_id IS NOT NULL
  AND s.company_id IS NOT NULL
ON CONFLICT (staff_id, clock_in) DO NOTHING;
