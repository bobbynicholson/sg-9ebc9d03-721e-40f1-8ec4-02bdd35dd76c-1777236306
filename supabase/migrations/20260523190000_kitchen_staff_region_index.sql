-- STA-C (staff deferred, 2026-05-23): index on
-- kitchen_staff_members.region_id so the multi-branch region filter
-- on /admin/staff doesn't trigger a sequential scan once the table
-- starts to grow.
--
-- The column has existed since migration 20260425114122_migration_
-- c915debc but was never honoured by the listStaffWithRates query.
-- STA-C wires it in (with a `region_id IS NULL` fallback so staff
-- without a region tag remain visible in every branch), and this
-- partial index keeps the lookup cheap.

CREATE INDEX IF NOT EXISTS idx_kitchen_staff_members_company_region
  ON public.kitchen_staff_members (company_id, region_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.kitchen_staff_members.region_id IS
  'STA-C: optional per-branch scope. NULL = visible across every region. /admin/staff filters by this when the global region filter is active.';
