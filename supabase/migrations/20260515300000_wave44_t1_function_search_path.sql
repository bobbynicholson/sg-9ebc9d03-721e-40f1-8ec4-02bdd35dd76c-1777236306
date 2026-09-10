-- Wave 44 Tier 1 -- pin SET search_path on Wave 41/42 functions.
--
-- function_search_path_mutable advisor warning: any function
-- without an explicit `SET search_path` resolves identifier
-- references against the caller's session search_path. A
-- malicious caller can inject a same-named object into a schema
-- they control and shadow the trusted one. Tightening to
-- `public, pg_temp` makes the resolution deterministic.
--
-- Six functions touched, all introduced in Wave 41 P4 / Wave 43:
--   tg_equipment_touch_updated_at
--   tg_set_order_assigned_at
--   tg_set_updated_at_driver_shifts
--   driver_shifts_view_insert
--   driver_shifts_view_update
--   driver_shifts_view_delete
--
-- Bodies preserved verbatim. Only addition is the SET clause.

CREATE OR REPLACE FUNCTION public.tg_equipment_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_set_order_assigned_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.assigned_driver_id IS NOT NULL
     AND OLD.assigned_driver_id IS NULL
     AND NEW.assigned_at IS NULL THEN
    NEW.assigned_at = NOW();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_driver_shifts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;

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
  IF NEW.created_at IS NULL THEN NEW.created_at := NOW(); END IF;
  IF NEW.updated_at IS NULL THEN NEW.updated_at := NOW(); END IF;

  INSERT INTO public.kitchen_shifts (
    id, company_id, staff_id, shift_date,
    planned_start, planned_end, actual_start, actual_end,
    status, notes, source, order_id, rate_multiplier,
    shift_type, created_by_user_id,
    created_at, updated_at, deleted_at
  ) VALUES (
    NEW.id, NEW.company_id, NEW.driver_id, NEW.shift_date,
    NEW.planned_start, NEW.planned_end, NEW.actual_start, NEW.actual_end,
    NEW.status, NEW.notes, NEW.source, NEW.order_id, NEW.rate_multiplier,
    'delivery', NEW.created_by_user_id,
    NEW.created_at, NEW.updated_at, NEW.deleted_at
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
$$;

CREATE OR REPLACE FUNCTION public.driver_shifts_view_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND OLD.company_id NOT IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
  ) THEN
    RAISE EXCEPTION 'driver_shifts: cross-tenant delete denied';
  END IF;

  DELETE FROM public.kitchen_shifts WHERE id = OLD.id;
  RETURN OLD;
END;
$$;
