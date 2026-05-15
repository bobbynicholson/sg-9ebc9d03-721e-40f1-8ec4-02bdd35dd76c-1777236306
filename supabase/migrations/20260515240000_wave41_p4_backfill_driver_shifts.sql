-- Wave 41 Phase 4 -- backfill driver_shifts -> kitchen_shifts.
--
-- Maps driver_id -> staff_id, sets shift_type='delivery', preserves
-- order_id, rate_multiplier, status, source, notes.
-- hours_worked is generated on kitchen_shifts so we omit it.
-- ON CONFLICT skip -- the (id) PK + unique index would catch a
-- re-run.
--
-- Live-data note: as of this migration there are exactly 2 rows in
-- driver_shifts (both from yesterday's testing). Idempotent insert
-- pattern lets us re-run safely if needed.

INSERT INTO public.kitchen_shifts (
  id, company_id, staff_id, shift_date,
  planned_start, planned_end, actual_start, actual_end,
  status, notes, source, order_id, rate_multiplier,
  shift_type, created_by_user_id,
  created_at, updated_at, deleted_at
)
SELECT
  ds.id,
  ds.company_id,
  ds.driver_id,
  ds.shift_date,
  ds.planned_start,
  ds.planned_end,
  ds.actual_start,
  ds.actual_end,
  ds.status,
  ds.notes,
  ds.source,
  ds.order_id,
  ds.rate_multiplier,
  'delivery',
  ds.created_by_user_id,
  ds.created_at,
  ds.updated_at,
  ds.deleted_at
FROM public.driver_shifts ds
ON CONFLICT (id) DO NOTHING;
