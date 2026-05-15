-- Wave 41 Phase 4 -- replace driver_shifts table with a view onto
-- kitchen_shifts WHERE shift_type='delivery'.
--
-- All 13 existing consumers (driverPayService, DriverClockButton,
-- driver-schedule.tsx, etc.) keep working unchanged. Their reads
-- hit the view; their writes hit the INSTEAD OF triggers below
-- which proxy to kitchen_shifts.
--
-- The view exposes the original column names (driver_id rather
-- than staff_id) for back-compat. New code is encouraged to read
-- kitchen_shifts directly with shift_type='delivery'.
--
-- Safe to run -- driver_shifts data was already backfilled in the
-- previous migration.

DROP TABLE IF EXISTS public.driver_shifts CASCADE;

CREATE VIEW public.driver_shifts AS
SELECT
  id,
  company_id,
  staff_id            AS driver_id,
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
  hours_worked
FROM public.kitchen_shifts
WHERE shift_type = 'delivery';

COMMENT ON VIEW public.driver_shifts IS
  'Wave 41 Phase 4. Back-compat view onto kitchen_shifts WHERE shift_type=delivery. New code should read kitchen_shifts directly.';

-- INSTEAD OF triggers proxy writes to the underlying table so
-- existing INSERT / UPDATE / DELETE paths keep working.
--
-- Note: INSERT trigger sets NEW.id BEFORE the underlying insert so
-- RETURNING / .single() echoes the new id back to PostgREST. Also
-- pulls hours_worked back since it's a generated column.

CREATE OR REPLACE FUNCTION public.driver_shifts_view_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  IF NEW.status IS NULL THEN
    NEW.status := 'scheduled';
  END IF;
  IF NEW.source IS NULL THEN
    NEW.source := 'manual';
  END IF;
  IF NEW.created_at IS NULL THEN
    NEW.created_at := NOW();
  END IF;
  IF NEW.updated_at IS NULL THEN
    NEW.updated_at := NOW();
  END IF;

  INSERT INTO public.kitchen_shifts (
    id, company_id, staff_id, shift_date,
    planned_start, planned_end, actual_start, actual_end,
    status, notes, source, order_id, rate_multiplier,
    shift_type, created_by_user_id,
    created_at, updated_at, deleted_at
  ) VALUES (
    NEW.id,
    NEW.company_id,
    NEW.driver_id,
    NEW.shift_date,
    NEW.planned_start,
    NEW.planned_end,
    NEW.actual_start,
    NEW.actual_end,
    NEW.status,
    NEW.notes,
    NEW.source,
    NEW.order_id,
    NEW.rate_multiplier,
    'delivery',
    NEW.created_by_user_id,
    NEW.created_at,
    NEW.updated_at,
    NEW.deleted_at
  );

  SELECT hours_worked INTO NEW.hours_worked
  FROM public.kitchen_shifts WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.driver_shifts_view_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.kitchen_shifts SET
    company_id         = NEW.company_id,
    staff_id           = NEW.driver_id,
    shift_date         = NEW.shift_date,
    planned_start      = NEW.planned_start,
    planned_end        = NEW.planned_end,
    actual_start       = NEW.actual_start,
    actual_end         = NEW.actual_end,
    status             = NEW.status,
    notes              = NEW.notes,
    source             = NEW.source,
    order_id           = NEW.order_id,
    rate_multiplier    = NEW.rate_multiplier,
    created_by_user_id = NEW.created_by_user_id,
    updated_at         = NOW(),
    deleted_at         = NEW.deleted_at
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.driver_shifts_view_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.kitchen_shifts WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER driver_shifts_view_insert_trg
  INSTEAD OF INSERT ON public.driver_shifts
  FOR EACH ROW EXECUTE FUNCTION public.driver_shifts_view_insert();

CREATE TRIGGER driver_shifts_view_update_trg
  INSTEAD OF UPDATE ON public.driver_shifts
  FOR EACH ROW EXECUTE FUNCTION public.driver_shifts_view_update();

CREATE TRIGGER driver_shifts_view_delete_trg
  INSTEAD OF DELETE ON public.driver_shifts
  FOR EACH ROW EXECUTE FUNCTION public.driver_shifts_view_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_shifts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_shifts TO service_role;
