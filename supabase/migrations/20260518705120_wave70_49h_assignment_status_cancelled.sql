-- Wave 70.49h - add 'cancelled' to the assignment_status enum.
--
-- The driver_assignments.status enum had only happy-path values:
-- assigned, accepted, en_route, picked_up, at_venue, delivered,
-- completed. No "this allocation didn't happen" state.
--
-- Wave 70.49 added a driver_assignments cascade to
-- releaseOrderResources() that flipped status='cancelled' on order
-- cancel. The enum rejected it -- every smoke run (and presumably
-- every real cancellation since Wave 70.49 shipped) returned
-- "invalid input value for enum assignment_status: 'cancelled'" and
-- the driver_assignments cascade silently failed via the helper's
-- try/catch. Surfaced by the Wave 70.49g E-stages (which check the
-- receipt for per-resource failures).
--
-- Adding 'cancelled' is the correct semantic match - mirrors the
-- pattern we used in Wave 70.51a (added 'voided' to invoice_status
-- for the same "we need a terminal 'didn't happen' state" reason).
--
-- ALTER TYPE ADD VALUE is atomic + safe; existing rows keep their
-- current status. No backfill needed.

DO $$ BEGIN
  ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.assignment_status IS
  'driver_assignments lifecycle. Happy path: assigned -> accepted -> en_route -> picked_up -> at_venue -> delivered -> completed. Terminal sad path: cancelled (added Wave 70.49h for the order-cancel cascade).';
