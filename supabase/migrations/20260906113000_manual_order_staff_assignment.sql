-- New orders must not silently inherit a default driver assignment.
-- Driver suggestions remain available from Dispatch and the order-level CTA;
-- an admin must explicitly commit the assignment.

ALTER TABLE public.regions
  ALTER COLUMN auto_assign_orders SET DEFAULT false;

UPDATE public.regions
SET auto_assign_orders = false
WHERE auto_assign_orders IS DISTINCT FROM false;
