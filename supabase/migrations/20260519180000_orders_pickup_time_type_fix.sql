-- Bug fix: orders.pickup_time was created as timestamp with time zone
-- but every code path (OrderDetailsModal, order-assignments inline edit,
-- orderToIcs combineDateTime, BookingFacts display) treats it as a
-- "HH:MM" wall-clock time. Saving "13:30" from any of those surfaces
-- raised "invalid input syntax for type timestamp with time zone".
--
-- Every existing row has pickup_time = NULL (the bug guaranteed no
-- writes ever succeeded), so the type change is lossless. Align with
-- event_time semantics (also time without time zone).

ALTER TABLE public.orders
  ALTER COLUMN pickup_time TYPE time without time zone
  USING NULL::time without time zone;

COMMENT ON COLUMN public.orders.pickup_time IS
  'Wall-clock time the driver leaves the kitchen with the food. HH:MM, no date / timezone. The actual stamp lives on picked_up_at when the driver acks pickup.';
