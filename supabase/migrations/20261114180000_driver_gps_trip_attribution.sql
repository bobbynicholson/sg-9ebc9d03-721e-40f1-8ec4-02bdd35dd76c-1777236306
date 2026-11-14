-- Attach GPS breadcrumbs to the same order/assignment timer that the
-- driver starts and completes in the PWA. Keep route-review results on
-- the assignment so settlement and payslip views share one source.

ALTER TABLE public.kitchen_shifts
  ADD COLUMN IF NOT EXISTS driver_assignment_id uuid
    REFERENCES public.driver_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_sitting_id uuid
    REFERENCES public.service_sittings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_type text
    CHECK (assignment_type IN ('delivery', 'collection'));

UPDATE public.kitchen_shifts
SET assignment_type = 'delivery'
WHERE shift_type = 'delivery'
  AND assignment_type IS NULL;

CREATE INDEX IF NOT EXISTS driver_shifts_open_auto_trip_idx
  ON public.kitchen_shifts (staff_id, actual_start DESC)
  WHERE source = 'auto'
    AND order_id IS NOT NULL
    AND actual_end IS NULL
    AND deleted_at IS NULL;

ALTER TABLE public.gps_tracking
  ADD COLUMN IF NOT EXISTS driver_assignment_id uuid
    REFERENCES public.driver_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_shift_id uuid
    REFERENCES public.kitchen_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_sitting_id uuid
    REFERENCES public.service_sittings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gps_tracking_assignment_time_idx
  ON public.gps_tracking (company_id, driver_assignment_id, timestamp)
  WHERE driver_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gps_tracking_shift_time_idx
  ON public.gps_tracking (company_id, driver_shift_id, timestamp)
  WHERE driver_shift_id IS NOT NULL;

CREATE OR REPLACE VIEW public.driver_shifts AS
SELECT
  id,
  company_id,
  staff_id AS driver_id,
  shift_date,
  planned_start,
  planned_end,
  actual_start,
  actual_end,
  status,
  notes,
  created_at,
  updated_at,
  deleted_at,
  source,
  order_id,
  rate_multiplier,
  created_by_user_id,
  hours_worked,
  driver_assignment_id,
  service_sitting_id,
  assignment_type
FROM public.kitchen_shifts
WHERE shift_type = 'delivery';

ALTER VIEW public.driver_shifts SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.driver_shifts_view_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.company_id NOT IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
  ) THEN
    RAISE EXCEPTION 'driver_shifts: cross-tenant write denied';
  END IF;
  IF NEW.id IS NULL THEN NEW.id := gen_random_uuid(); END IF;
  IF NEW.status IS NULL THEN NEW.status := 'scheduled'; END IF;
  IF NEW.source IS NULL THEN NEW.source := 'manual'; END IF;
  IF NEW.assignment_type IS NULL THEN NEW.assignment_type := 'delivery'; END IF;
  IF NEW.created_at IS NULL THEN NEW.created_at := NOW(); END IF;
  IF NEW.updated_at IS NULL THEN NEW.updated_at := NOW(); END IF;

  INSERT INTO public.kitchen_shifts (
    id, company_id, staff_id, shift_date, planned_start, planned_end,
    actual_start, actual_end, status, notes, source, order_id,
    rate_multiplier, shift_type, created_by_user_id, created_at,
    updated_at, deleted_at, driver_assignment_id, service_sitting_id,
    assignment_type
  ) VALUES (
    NEW.id, NEW.company_id, NEW.driver_id, NEW.shift_date,
    NEW.planned_start, NEW.planned_end, NEW.actual_start, NEW.actual_end,
    NEW.status, NEW.notes, NEW.source, NEW.order_id, NEW.rate_multiplier,
    'delivery', NEW.created_by_user_id, NEW.created_at, NEW.updated_at,
    NEW.deleted_at, NEW.driver_assignment_id, NEW.service_sitting_id,
    NEW.assignment_type
  );
  SELECT hours_worked INTO NEW.hours_worked
    FROM public.kitchen_shifts WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_shifts_view_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.company_id NOT IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
  ) THEN
    RAISE EXCEPTION 'driver_shifts: cross-tenant write denied';
  END IF;
  UPDATE public.kitchen_shifts SET
    company_id = NEW.company_id,
    staff_id = NEW.driver_id,
    shift_date = NEW.shift_date,
    planned_start = NEW.planned_start,
    planned_end = NEW.planned_end,
    actual_start = NEW.actual_start,
    actual_end = NEW.actual_end,
    status = NEW.status,
    notes = NEW.notes,
    source = NEW.source,
    order_id = NEW.order_id,
    rate_multiplier = NEW.rate_multiplier,
    created_by_user_id = NEW.created_by_user_id,
    driver_assignment_id = NEW.driver_assignment_id,
    service_sitting_id = NEW.service_sitting_id,
    assignment_type = NEW.assignment_type,
    updated_at = NOW(),
    deleted_at = NEW.deleted_at
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

ALTER TABLE public.driver_assignments
  ADD COLUMN IF NOT EXISTS gps_distance_km numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gps_expected_distance_km numeric(10, 2),
  ADD COLUMN IF NOT EXISTS gps_distance_status text NOT NULL DEFAULT 'not_available'
    CHECK (gps_distance_status IN ('complete', 'partial', 'not_available')),
  ADD COLUMN IF NOT EXISTS gps_trip_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS gps_distance_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_distance_review_reason text,
  ADD COLUMN IF NOT EXISTS gps_distance_checked_at timestamptz;

COMMENT ON COLUMN public.driver_assignments.gps_distance_km IS
  'Filtered GPS route distance captured during the assignment-specific driver timer; may be partial when mobile location samples are interrupted.';
COMMENT ON COLUMN public.driver_assignments.gps_distance_review_required IS
  'True when captured route distance materially exceeds the saved route estimate and needs an admin review.';
