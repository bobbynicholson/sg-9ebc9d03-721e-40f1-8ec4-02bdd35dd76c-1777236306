-- Driver split-shift accounting (Callum Pic 91).
--
-- The old unique index allowed only one row per staff/date/role. After a
-- driver clocked out, the dashboard could not insert the next session. The
-- first UI workaround reopened the completed row by setting actual_end=NULL,
-- but that destroyed the first clock-out and paid the off-duty gap as hours.
--
-- Keep the one-row-per-role/day rule for kitchen/cleaning rosters and one
-- planned delivery roster row per day, while allowing multiple *unplanned,
-- completed* delivery sessions. A separate partial unique index still makes
-- concurrent double-taps safe by permitting only one open delivery session
-- per driver/day.

BEGIN;

DROP INDEX IF EXISTS public.kitchen_shifts_one_per_role_per_day;
-- Drift/fresh-install safety: an environment that skipped the shift_type
-- migration can still retain the older two-column index under this name.
DROP INDEX IF EXISTS public.kitchen_shifts_one_per_chef_per_day;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_shifts_one_non_delivery_role_per_day
  ON public.kitchen_shifts (staff_id, shift_date, shift_type)
  WHERE deleted_at IS NULL
    AND shift_type <> 'delivery';

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_shifts_one_delivery_roster_per_day
  ON public.kitchen_shifts (staff_id, shift_date, shift_type)
  WHERE deleted_at IS NULL
    AND shift_type = 'delivery'
    AND planned_start IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_shifts_one_open_delivery_session_per_day
  ON public.kitchen_shifts (staff_id, shift_date, shift_type)
  WHERE deleted_at IS NULL
    AND shift_type = 'delivery'
    AND actual_start IS NOT NULL
    AND actual_end IS NULL;

COMMENT ON INDEX public.kitchen_shifts_one_open_delivery_session_per_day IS
  'Prevents double-tap/concurrent driver clock-ins while allowing multiple completed split-shift sessions per day. Scope is per-day so this migration is safe with legacy stale cross-day opens; DriverClockButton loads any open date and requires it to be closed before a new clock-in.';

COMMIT;
