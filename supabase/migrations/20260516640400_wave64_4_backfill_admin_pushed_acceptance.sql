-- Wave 64.4 -- backfill admin-pushed driver_assignments to accepted.
--
-- Pre-Wave-64.4 dispatchService.assignDriverWithGate inserted rows
-- with status='assigned' + accepted_at=NULL, while the parallel
-- claim_order RPC inserted status='accepted' + accepted_at=NOW().
-- The asymmetry made the orderReadiness driver_acknowledged signal
-- false-positive on every admin-pushed run (ORD-003828 / Ronan
-- Whittaker via bulk-assign was the live example).
--
-- This migration backfills the existing assigned rows that came from
-- the admin path so the chip stops false-flagging on legacy data.
-- We identify admin-pushed rows via order_assignment_audit: if any
-- audit row exists where performed_by != to_driver_id for the same
-- (order_id, driver_id) pair, the assignment was admin-pushed, not
-- self-claimed. Self-claim rows (performed_by = to_driver_id, e.g.
-- "Self-claim by driver") are left alone -- they already have
-- status='accepted'.
--
-- accepted_at is stamped to the row's assigned_at so the timeline
-- reads correctly (acceptance happened at assignment time for these).

UPDATE public.driver_assignments da
SET
  status = 'accepted',
  accepted_at = COALESCE(da.accepted_at, da.assigned_at, NOW()),
  updated_at = NOW()
WHERE da.status = 'assigned'
  AND da.assignment_type = 'delivery'
  AND da.accepted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.order_assignment_audit a
    WHERE a.order_id = da.order_id
      AND a.to_driver_id = da.driver_id
      AND a.performed_by IS NOT NULL
      AND a.performed_by != da.driver_id
  );

-- Note: no DOWN migration. Reverting would require re-asserting the
-- pre-Wave-64.4 broken state, which has no operational value.
