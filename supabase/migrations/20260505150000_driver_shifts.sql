-- Driver shifts -- pay-tracking columns (Stage 2 of driver hourly-rate
-- build).
--
-- A driver_shifts table already exists with scheduling semantics:
-- shift_date / planned_start / planned_end / actual_start / actual_end
-- / status. Perfect base for the pay calculation -- actual_start +
-- actual_end ARE the clock-in / clock-out we need. We just need a few
-- extra columns:
--
--   source            -- 'manual' (admin entered) | 'auto' (dispatch
--                        stamped on delivery start / end). Lets us
--                        distinguish hand-typed shifts from system
--                        ones in reports.
--   order_id          -- nullable FK to orders for auto-shifts pinned
--                        to a specific delivery.
--   rate_multiplier   -- BCEA. 2x for Sundays / public holidays.
--                        NULL = 1x.
--   hours_worked      -- generated, decimal hours from actual_start ->
--                        actual_end. NULL while still on shift.
--   created_by_user_id-- audit. Who logged this shift?
--
-- RLS already exists on the table; we don't redefine it.

ALTER TABLE public.driver_shifts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto')),
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_multiplier NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop and recreate the generated column in case columns differ
-- between dev / live. Postgres can't ALTER a generated column expression
-- in place.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'driver_shifts'
      AND column_name = 'hours_worked'
  ) THEN
    ALTER TABLE public.driver_shifts DROP COLUMN hours_worked;
  END IF;
END $$;

ALTER TABLE public.driver_shifts
  ADD COLUMN hours_worked NUMERIC(10, 2) GENERATED ALWAYS AS (
    CASE
      WHEN actual_end IS NULL OR actual_start IS NULL THEN NULL
      ELSE ROUND(EXTRACT(EPOCH FROM (actual_end - actual_start)) / 3600.0, 2)
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS driver_shifts_open_idx
  ON public.driver_shifts (driver_id)
  WHERE actual_end IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS driver_shifts_order_idx
  ON public.driver_shifts (order_id)
  WHERE order_id IS NOT NULL;

COMMENT ON COLUMN public.driver_shifts.source IS
  '''manual'' (admin entered) or ''auto'' (dispatch pipeline stamped on delivery start/end).';
COMMENT ON COLUMN public.driver_shifts.order_id IS
  'For auto-shifts, the delivery this shift was logged against.';
COMMENT ON COLUMN public.driver_shifts.rate_multiplier IS
  'BCEA pay multiplier. 2x for Sundays + public holidays. NULL = 1x.';
COMMENT ON COLUMN public.driver_shifts.hours_worked IS
  'Generated decimal hours from actual_start -> actual_end. NULL while clock_out is missing.';
