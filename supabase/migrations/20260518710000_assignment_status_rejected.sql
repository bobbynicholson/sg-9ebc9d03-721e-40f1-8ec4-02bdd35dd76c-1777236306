-- Wave 70.49i - add 'rejected' to the assignment_status enum.
--
-- DeclineAssignmentDialog has been writing
-- driver_assignments.status = 'rejected' since the dialog shipped, but
-- 'rejected' was never in the enum. Postgres raised
-- "invalid input value for enum assignment_status: 'rejected'" and the
-- update silently failed (the dialog's try/catch threw, but the order
-- unassign + audit row creation that followed succeeded, masking the
-- problem - the order looked freed in the UI even though the
-- assignment row stayed at 'accepted').
--
-- 'rejected' is semantically distinct from 'cancelled':
-- - 'cancelled' = the admin / system cancelled the assignment (e.g.
--   order cancellation, driver replacement, no-show).
-- - 'rejected' = the driver actively declined the assignment with a
--   reason captured in rejection_reason. Surfacing this in the audit
--   trail matters for driver performance signals and dispatch routing.
--
-- The dispatch board uses .neq("status", "rejected") / .neq("status",
-- "cancelled") to scope active assignments; both terminal states
-- should coexist.

DO $$
BEGIN
  ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.assignment_status IS
  'Lifecycle of a driver_assignment row. happy path: assigned -> accepted -> en_route -> picked_up -> at_venue -> delivered -> completed. Terminal off-paths: cancelled (admin/system), rejected (driver decline).';
