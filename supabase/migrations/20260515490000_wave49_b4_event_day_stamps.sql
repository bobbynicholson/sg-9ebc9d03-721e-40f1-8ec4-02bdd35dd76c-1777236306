-- Wave 49 B4 -- event-day stamp columns on orders.
--
-- Audit (Specialist 2) found the event-day chain ends at delivered_at.
-- The system stamps "we got there" but never:
--   * setup_started_at -- when the team began rigging at the venue
--   * service_started_at -- when food was actually served
--   * departed_venue_at -- when the truck rolled home
--
-- All three are needed for the new driver dashboard stamp progression
-- (B2) and for accurate per-leg payroll. driver_assignments already
-- carries the corresponding columns; orders was the laggard.
--
-- Idempotent via IF NOT EXISTS.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS setup_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS service_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS departed_venue_at TIMESTAMPTZ,
  -- Wave 49 B1 lockstep needs this -- arrived_at_venue_at lives on
  -- driver_assignments (Specialist 2 confirmed) but admin / dashboard
  -- queries against orders also want it. Mirror the column.
  ADD COLUMN IF NOT EXISTS arrived_at_venue_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.setup_started_at IS
  'Wave 49 -- driver tap when rigging at the venue begins. Mirrors driver_assignments.';
COMMENT ON COLUMN public.orders.service_started_at IS
  'Wave 49 -- driver tap when food service begins.';
COMMENT ON COLUMN public.orders.departed_venue_at IS
  'Wave 49 -- driver tap when the truck rolls home from the venue.';
COMMENT ON COLUMN public.orders.arrived_at_venue_at IS
  'Wave 49 -- mirrored from driver_assignments so admin queries do not need a join.';

-- Index supporting the lockstep mirror queries in orderWorkflow.
-- Every status flip needs to find the active delivery assignment for
-- this order. Without this we sequential-scan driver_assignments.
CREATE INDEX IF NOT EXISTS idx_driver_assignments_order_type_status
  ON public.driver_assignments (order_id, assignment_type, status);

-- Index supporting the tightened auto-complete cron filter.
CREATE INDEX IF NOT EXISTS idx_orders_status_delivered_at
  ON public.orders (status, delivered_at)
  WHERE status = 'delivered';
