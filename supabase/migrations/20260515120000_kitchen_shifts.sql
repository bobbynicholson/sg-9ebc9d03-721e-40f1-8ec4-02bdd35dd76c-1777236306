-- Wave 36.1: kitchen_shifts table for shift planning + payroll roots.
--
-- Mirrors driver_shifts shape so the existing scheduling UI pattern
-- (admin/driver-schedule.tsx + LogDriverShiftModal) can be ported
-- 1:1 for the kitchen surface, and so the same planned-vs-actual
-- semantics work end-to-end (alerts cron, payroll calc).
--
-- Distinction from kitchen_duty_shifts:
--   * kitchen_duty_shifts = the live clock-in/out state (existing,
--     unchanged) -- one row per actual shift, no planning.
--   * kitchen_shifts (new) = the scheduled roster -- planned start/end
--     per chef per day, status reflects scheduled/active/completed/
--     missed/cancelled. actual_start/actual_end get stamped from the
--     matching kitchen_duty_shifts row when the chef clocks in.
--
-- Why two tables instead of extending kitchen_duty_shifts:
--   * Decouples planning from clock-state -- the duty page can keep
--     pulling kitchen_duty_shifts unchanged.
--   * Lets us pre-fill a week of planned shifts without polluting
--     the live clock-in stream.
--   * Mirrors driver_shifts pattern, which already proved itself in
--     prod for ~3 weeks.

CREATE TABLE IF NOT EXISTS public.kitchen_shifts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  staff_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_date           DATE NOT NULL,
  planned_start        TIME WITHOUT TIME ZONE,
  planned_end          TIME WITHOUT TIME ZONE,
  actual_start         TIMESTAMP WITH TIME ZONE,
  actual_end           TIMESTAMP WITH TIME ZONE,
  status               TEXT NOT NULL DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled', 'active', 'completed', 'missed', 'cancelled')),
  source               TEXT NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('manual', 'auto')),
  rate_multiplier      NUMERIC(4, 2),
  notes                TEXT,
  duty_shift_id        UUID REFERENCES public.kitchen_duty_shifts(id) ON DELETE SET NULL,
  created_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMP WITH TIME ZONE,
  -- Generated decimal-hours column. NULL while clock-out is missing.
  -- Same shape as driver_shifts.hours_worked so the payroll calc
  -- can pull it the same way.
  hours_worked         NUMERIC(10, 2) GENERATED ALWAYS AS (
    CASE
      WHEN actual_end IS NULL OR actual_start IS NULL THEN NULL
      ELSE ROUND(EXTRACT(EPOCH FROM (actual_end - actual_start)) / 3600.0, 2)
    END
  ) STORED
);

-- Index targets:
--   * one chef's roster for a given day (the lookup the duty page
--     fires when stamping actual_start)
--   * roster grid query: company + week range (admin schedule view)
--   * missed-clock-in cron: status='scheduled' AND past planned start
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_shifts_one_per_chef_per_day
  ON public.kitchen_shifts (staff_id, shift_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS kitchen_shifts_company_date_idx
  ON public.kitchen_shifts (company_id, shift_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS kitchen_shifts_open_idx
  ON public.kitchen_shifts (staff_id)
  WHERE actual_end IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS kitchen_shifts_missed_check_idx
  ON public.kitchen_shifts (company_id, shift_date)
  WHERE status = 'scheduled' AND deleted_at IS NULL;

-- Auto-bump updated_at on every UPDATE -- same pattern as the rest
-- of the schema.
CREATE TRIGGER kitchen_shifts_updated_at
  BEFORE UPDATE ON public.kitchen_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: company-scoped, mirroring kitchen_duty_shifts. Staff can read
-- their own + their company; admins read everything in their company.
ALTER TABLE public.kitchen_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY kitchen_shifts_company_select
  ON public.kitchen_shifts FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY kitchen_shifts_admin_write
  ON public.kitchen_shifts FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

COMMENT ON TABLE public.kitchen_shifts IS
  'Planned roster for kitchen staff. Distinct from kitchen_duty_shifts (live clock-in state). Mirrors driver_shifts shape so the same scheduling + payroll patterns apply.';
