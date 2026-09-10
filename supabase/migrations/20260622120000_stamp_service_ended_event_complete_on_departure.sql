-- Auto-record service_ended_at + event_complete_at when the driver
-- departs the venue.
--
-- Until now those two moments lived ONLY on event_attendance (one row
-- per waiter, stamped from the waiter panel). For a driver-run order
-- with no waiters there was nowhere to record them, so the order
-- timeline showed "Service ended" / "Event complete" as blank forever
-- even though the truck had provably left the venue (departed_venue_at
-- stamped). A truck cannot depart before the event is over, so the
-- departure moment is a safe upper bound for both.
--
-- Fix:
--   1. Add orders.service_ended_at + orders.event_complete_at (mirrors
--      the existing orders.setup_started_at / service_started_at /
--      departed_venue_at on-site columns).
--   2. Extend stamp_order_event_day_from_confirmation so a
--      'departed_venue' confirmation also stamps those two columns
--      (COALESCE - only when still null, never clobbering a real
--      waiter-panel value that already landed in event_attendance and
--      was mirrored across).
--   3. Backfill existing orders from departed_venue_at /
--      driver_confirmations.
--
-- Idempotent - safe to run repeatedly.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_ended_at   timestamptz,
  ADD COLUMN IF NOT EXISTS event_complete_at  timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_order_event_day_from_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.confirmation_type = 'at_venue' THEN
    -- The driver's "Arrived at venue" tap previously only set delivered_at
    -- (via updateOrderStatus), leaving arrived_at_venue_at null - so the
    -- timeline showed "Arrived at venue" blank while "Delivered" (a LATER
    -- stage) was done. Stamp the arrival moment too.
    UPDATE public.orders
       SET arrived_at_venue_at = COALESCE(arrived_at_venue_at, NEW.confirmed_at)
     WHERE id = NEW.order_id AND arrived_at_venue_at IS NULL;
  ELSIF NEW.confirmation_type = 'setup_started' THEN
    UPDATE public.orders
       SET setup_started_at = COALESCE(setup_started_at, NEW.confirmed_at)
     WHERE id = NEW.order_id AND setup_started_at IS NULL;
  ELSIF NEW.confirmation_type = 'service_started' THEN
    UPDATE public.orders
       SET service_started_at = COALESCE(service_started_at, NEW.confirmed_at)
     WHERE id = NEW.order_id AND service_started_at IS NULL;
  ELSIF NEW.confirmation_type = 'departed_venue' THEN
    -- Departing the venue means the event is over and service has ended.
    -- Stamp departed_venue_at plus service_ended_at / event_complete_at
    -- as an upper bound, each only when still null so an earlier, more
    -- precise waiter-panel value is never overwritten.
    UPDATE public.orders
       SET departed_venue_at  = COALESCE(departed_venue_at,  NEW.confirmed_at),
           service_ended_at   = COALESCE(service_ended_at,   NEW.confirmed_at),
           event_complete_at  = COALESCE(event_complete_at,  NEW.confirmed_at)
     WHERE id = NEW.order_id
       AND (departed_venue_at IS NULL
            OR service_ended_at IS NULL
            OR event_complete_at IS NULL);
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_stamp_order_event_day ON public.driver_confirmations;
CREATE TRIGGER tg_stamp_order_event_day
  AFTER INSERT ON public.driver_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_order_event_day_from_confirmation();

-- Backfill: any order already departed but missing the two new stamps.
-- Prefer the order's own departed_venue_at; fall back to the earliest
-- departed_venue driver_confirmation.
UPDATE public.orders o
   SET service_ended_at  = COALESCE(o.service_ended_at,  o.departed_venue_at),
       event_complete_at = COALESCE(o.event_complete_at, o.departed_venue_at)
 WHERE o.departed_venue_at IS NOT NULL
   AND (o.service_ended_at IS NULL OR o.event_complete_at IS NULL);

UPDATE public.orders o
   SET service_ended_at  = COALESCE(o.service_ended_at,  c.ts),
       event_complete_at = COALESCE(o.event_complete_at, c.ts)
  FROM (
    SELECT order_id, MIN(confirmed_at) AS ts
    FROM public.driver_confirmations
    WHERE confirmation_type = 'departed_venue'
    GROUP BY order_id
  ) c
 WHERE o.id = c.order_id
   AND (o.service_ended_at IS NULL OR o.event_complete_at IS NULL);
