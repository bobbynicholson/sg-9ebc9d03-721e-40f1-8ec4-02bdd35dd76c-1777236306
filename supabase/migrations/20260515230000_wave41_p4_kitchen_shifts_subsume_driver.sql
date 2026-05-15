-- Wave 41 Phase 4 -- prepare kitchen_shifts to subsume driver_shifts.
--
-- Driver shifts already share 90% of the schema. The two extras
-- they need:
--   - 'delivery' added to shift_type CHECK
--   - order_id (which delivery this shift was for)
--
-- staff_shift_tasks already FKs to kitchen_shifts.id, so a
-- delivery shift can carry task chips (delivery / waitering /
-- breakdown) the same way kitchen + cleaning shifts do.

ALTER TABLE public.kitchen_shifts
  DROP CONSTRAINT IF EXISTS kitchen_shifts_shift_type_check;

ALTER TABLE public.kitchen_shifts
  ADD CONSTRAINT kitchen_shifts_shift_type_check
  CHECK (shift_type IN ('kitchen', 'cleaning', 'kitchen_and_cleaning', 'general', 'delivery'));

ALTER TABLE public.kitchen_shifts
  ADD COLUMN IF NOT EXISTS order_id UUID;

CREATE INDEX IF NOT EXISTS kitchen_shifts_order_idx
  ON public.kitchen_shifts (order_id) WHERE order_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.kitchen_shifts.order_id IS
  'Wave 41 Phase 4. Delivery shifts (shift_type=delivery) link to the order they served. NULL for non-delivery shift_types.';
