-- Wave 49 B5 -- backfill driver_assignments status + stamps to
-- mirror the orders.status truth source.
--
-- Audit (Specialist 2) found driver_assignments.status rotted at
-- 'accepted' for the entire job lifetime because nothing advanced it.
-- Wave 49 B1 wired the lockstep mirror for new flips going forward;
-- this backfill catches the historical rows so dashboards + payroll
-- reads on da.status finally line up with reality.
--
-- Strategy: walk every delivery driver_assignment whose linked order
-- has progressed past 'accepted', stamp the highest-status timestamp
-- the order reached, and advance da.status to match. We honour the
-- existing column convention (NULL = never reached) so re-runs are
-- safe.

-- Step 1 -- promote to 'completed' where the order is completed.
UPDATE public.driver_assignments da
SET
  status = 'completed',
  completed_at = COALESCE(da.completed_at, o.completed_at),
  delivered_at = COALESCE(da.delivered_at, o.delivered_at),
  picked_up_at = COALESCE(da.picked_up_at, o.picked_up_at),
  en_route_at = COALESCE(da.en_route_at, o.picked_up_at),
  updated_at = NOW()
FROM public.orders o
WHERE da.order_id = o.id
  AND da.assignment_type = 'delivery'
  AND o.status = 'completed'
  AND da.status <> 'completed';

-- Step 2 -- promote to 'delivered' where the order is delivered.
UPDATE public.driver_assignments da
SET
  status = 'delivered',
  delivered_at = COALESCE(da.delivered_at, o.delivered_at),
  picked_up_at = COALESCE(da.picked_up_at, o.picked_up_at),
  en_route_at = COALESCE(da.en_route_at, o.picked_up_at),
  updated_at = NOW()
FROM public.orders o
WHERE da.order_id = o.id
  AND da.assignment_type = 'delivery'
  AND o.status = 'delivered'
  AND da.status NOT IN ('delivered', 'completed');

-- Step 3 -- promote to 'en_route' where order is in_transit.
UPDATE public.driver_assignments da
SET
  status = 'en_route',
  en_route_at = COALESCE(da.en_route_at, o.picked_up_at, NOW()),
  picked_up_at = COALESCE(da.picked_up_at, o.picked_up_at),
  updated_at = NOW()
FROM public.orders o
WHERE da.order_id = o.id
  AND da.assignment_type = 'delivery'
  AND o.status = 'in_transit'
  AND da.status NOT IN ('en_route', 'picked_up', 'at_venue', 'delivered', 'completed');
