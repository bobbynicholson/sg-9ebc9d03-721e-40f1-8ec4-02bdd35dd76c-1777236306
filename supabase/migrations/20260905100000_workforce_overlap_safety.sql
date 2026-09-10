-- Workforce overlap safety.
-- Admin dispatch retries must be idempotent even when two browser tabs submit
-- the same assignment at the same time.

create unique index if not exists driver_assignments_order_driver_type_unique
  on public.driver_assignments (order_id, driver_id, assignment_type);

comment on index public.driver_assignments_order_driver_type_unique is
  'Prevents duplicate assignment rows during concurrent dispatch retries.';
