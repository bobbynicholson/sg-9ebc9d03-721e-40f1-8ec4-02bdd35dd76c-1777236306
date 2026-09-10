-- Wave 42 Tier 1 (CRITICAL FIX) -- close the cross-tenant write
-- primitive Wave 41 Phase 4 introduced.
--
-- The driver_shifts view trigger functions ran as SECURITY DEFINER
-- (owner=postgres), bypassing RLS on the underlying kitchen_shifts
-- table. Combined with INSERT/UPDATE/DELETE granted to authenticated
-- on the view, this let any signed-in user write delivery rows
-- with arbitrary company_id / staff_id values.
--
-- Three-part fix:
--   1. Drop SECURITY DEFINER from all three trigger functions so
--      they run as INVOKER -- RLS on kitchen_shifts now applies.
--   2. Add an explicit auth.uid() -> profiles.company_id guard
--      inside the trigger functions as a second line of defence.
--   3. Add a kitchen_shifts_delivery_self_write RLS policy so
--      drivers can still self-write their own company's delivery
--      shifts (preserving the original loose driver_shifts
--      semantics that admin-only kitchen_shifts policies broke).
--   4. Add a staff_shift_tasks_self_write RLS policy so non-admin
--      staff can drop typed task chips on shifts they own
--      (unblocks personal task surfaces in Tier 3).

-- ---- 1 + 2: trigger functions, no DEFINER + explicit guard ----

CREATE OR REPLACE FUNCTION public.driver_shifts_view_insert()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.driver_shifts_view_update()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.driver_shifts_view_delete()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- ---- 3: kitchen_shifts delivery self-write carve-out ----

DROP POLICY IF EXISTS kitchen_shifts_delivery_self_write ON public.kitchen_shifts;
CREATE POLICY kitchen_shifts_delivery_self_write
  ON public.kitchen_shifts
  FOR ALL
  USING (
    shift_type = 'delivery'
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    shift_type = 'delivery'
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ---- 4: staff_shift_tasks self-write ----

DROP POLICY IF EXISTS staff_shift_tasks_self_write ON public.staff_shift_tasks;
CREATE POLICY staff_shift_tasks_self_write
  ON public.staff_shift_tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kitchen_shifts ks
      WHERE ks.id = staff_shift_tasks.shift_id
        AND ks.staff_id = auth.uid()
        AND ks.company_id = staff_shift_tasks.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.kitchen_shifts ks
      WHERE ks.id = staff_shift_tasks.shift_id
        AND ks.staff_id = auth.uid()
        AND ks.company_id = staff_shift_tasks.company_id
    )
  );
