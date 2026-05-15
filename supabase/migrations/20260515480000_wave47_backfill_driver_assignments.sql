-- Wave 47 -- backfill driver_assignments rows for every order that
-- was admin-assigned (orders.assigned_driver_id IS NOT NULL) but
-- is missing the formal driver_assignments row.
--
-- Pre-Wave-47 only the claim_order RPC (driver self-claim) wrote
-- this row. dispatchService.assignDriverWithGate (the path used by
-- the dispatch UI's Assign Driver + Bulk Assign buttons) skipped
-- the insert entirely. Two silent bugs followed:
--   1. Wave 46 readiness chip false-negatived ("Driver assigned
--      but hasn't accepted -- no driver_assignments row") for
--      every admin-assigned order, while the dispatch UI clearly
--      showed the assignment.
--   2. driverPayService reads driver_assignments to compute
--      earnings -- bulk-assigned orders earned $0 driver pay
--      forever.
--
-- This migration backfills the missing rows once. The dispatch
-- service code change ships in the same wave so future
-- assignments populate the row in lockstep.
--
-- Idempotent via NOT EXISTS, safe to re-run.

INSERT INTO public.driver_assignments (
  company_id, order_id, driver_id, status, assigned_at, assignment_type
)
SELECT
  o.company_id,
  o.id,
  o.assigned_driver_id,
  'assigned',
  COALESCE(o.assigned_at, NOW()),
  'delivery'
FROM public.orders o
WHERE o.assigned_driver_id IS NOT NULL
  AND o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_assignments da
    WHERE da.order_id = o.id
      AND da.driver_id = o.assigned_driver_id
      AND da.assignment_type = 'delivery'
  );
