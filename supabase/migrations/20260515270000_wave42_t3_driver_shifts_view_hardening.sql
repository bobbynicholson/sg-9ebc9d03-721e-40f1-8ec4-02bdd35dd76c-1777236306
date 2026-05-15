-- Wave 42 Tier 3 -- harden driver_shifts view ergonomics.
--
-- Bug-hunter audit flagged two LOW-severity footguns:
--   1. The view has no FK metadata, so any future PostgREST embed
--      (.select(`orders!driver_shifts(...)`) syntax) silently
--      returns no related rows. No current consumer hits this,
--      but worth a hard signal for the next dev who tries.
--   2. The INSTEAD OF UPDATE trigger silently drops writes to
--      hours_worked (generated column) and shift_type (the merge
--      target is always 'delivery'). Currently no consumer writes
--      either, but a future one would no-op without warning.
--
-- Fix: add a richer COMMENT ON VIEW so the next dev sees the
-- guidance, and make the UPDATE trigger document the silent drops
-- inline.

COMMENT ON VIEW public.driver_shifts IS
  'Wave 41 Phase 4 back-compat view onto kitchen_shifts WHERE shift_type=delivery.
NEW CODE: read kitchen_shifts directly with .eq("shift_type","delivery").
NOTES:
  - View has no FK metadata; PostgREST embeds (.select("orders!driver_shifts(...)")) will not work.
  - INSTEAD OF UPDATE trigger ignores hours_worked (generated) and shift_type (locked to delivery).
  - Use .from("kitchen_shifts") for joins to staff_shift_tasks or orders.';

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
    -- Wave 42 Tier 3 -- shift_type stays 'delivery' on this view.
    -- hours_worked is generated and not writable.
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
