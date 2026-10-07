-- "Service ended" / "Event complete" for drop-off jobs come from the
-- collection trip, not from the driver leaving after setup.
--
-- 20260622120000 made a 'departed_venue' driver confirmation stamp
-- orders.service_ended_at + event_complete_at, on the reasoning that a
-- truck can't leave before the event is over. That only holds when the
-- driver stays on site. On a deliver-and-collect job without waiters the
-- driver drops off, sets up and leaves BEFORE the event starts; the
-- equipment comes back later on a separate collection trip (same day:
-- event start + 5h; next day: 09:00). Those jobs were marked
-- "Event complete" at e.g. 11:30 for a 12:00 event.
--
-- Fix:
--   1. 'departed_venue' still stamps departed_venue_at, but only stamps
--      service_ended_at / event_complete_at when the order has NO
--      collection trip (driver stayed through the event, or nothing to
--      collect). The collection trip is created when the order is
--      delivered (setup completed), so it already exists at departure.
--   2. New trigger on driver_assignments: when a collection trip reaches
--      picked_up ("Equipment collected") or completed ("Equipment back at
--      base"), stamp service_ended_at / event_complete_at with that time -
--      the first moment the event is known to be over. COALESCE: an
--      earlier, more precise waiter-panel value is never overwritten.
--
-- No backfill: at the time of writing no collection trips exist, so no
-- order carries a drop-off-time "Event complete".
--
-- Idempotent - safe to run repeatedly.

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
    UPDATE public.orders
       SET arrived_at_venue_at = COALESCE(arrived_at_venue_at, NEW.confirmed_at)
     WHERE id = NEW.order_id AND arrived_at_venue_at IS NULL;
  ELSIF NEW.confirmation_type = 'setup_started' THEN
    UPDATE public.orders
       SET setup_started_at = COALESCE(setup_started_at, NEW.confirmed_at)
     WHERE id = NEW.order_id AND setup_started_at IS NULL;
  ELSIF NEW.confirmation_type = 'service_started' THEN
    -- Kept for older clients; the driver run sheet no longer offers it.
    UPDATE public.orders
       SET service_started_at = COALESCE(service_started_at, NEW.confirmed_at)
     WHERE id = NEW.order_id AND service_started_at IS NULL;
  ELSIF NEW.confirmation_type = 'departed_venue' THEN
    UPDATE public.orders
       SET departed_venue_at = COALESCE(departed_venue_at, NEW.confirmed_at)
     WHERE id = NEW.order_id AND departed_venue_at IS NULL;

    -- Only an upper bound for the event end when nobody is coming back
    -- for the equipment, i.e. the driver stayed through the event.
    IF NOT EXISTS (
      SELECT 1 FROM public.driver_assignments da
       WHERE da.order_id = NEW.order_id
         AND da.assignment_type = 'collection'
    ) THEN
      UPDATE public.orders
         SET service_ended_at  = COALESCE(service_ended_at,  NEW.confirmed_at),
             event_complete_at = COALESCE(event_complete_at, NEW.confirmed_at)
       WHERE id = NEW.order_id
         AND (service_ended_at IS NULL OR event_complete_at IS NULL);
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_stamp_order_event_day ON public.driver_confirmations;
CREATE TRIGGER tg_stamp_order_event_day
  AFTER INSERT ON public.driver_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_order_event_day_from_confirmation();

CREATE OR REPLACE FUNCTION public.stamp_order_event_end_from_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ts timestamptz;
BEGIN
  IF NEW.order_id IS NULL
     OR NEW.assignment_type IS DISTINCT FROM 'collection'
     OR NEW.status::text NOT IN ('picked_up', 'completed')
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  ts := COALESCE(NEW.picked_up_at, NEW.completed_at, now());
  -- The collection may be run by a driver other than the order's assigned
  -- driver; the trusted-stamp path in the orders whitelist
  -- (20261007115900) lets these two stamps through for them.
  PERFORM set_config('app.trusted_order_stamp', 'on', true);
  UPDATE public.orders
     SET service_ended_at  = COALESCE(service_ended_at,  ts),
         event_complete_at = COALESCE(event_complete_at, ts)
   WHERE id = NEW.order_id
     AND (service_ended_at IS NULL OR event_complete_at IS NULL);
  PERFORM set_config('app.trusted_order_stamp', 'off', true);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_stamp_order_event_end_from_collection ON public.driver_assignments;
CREATE TRIGGER tg_stamp_order_event_end_from_collection
  AFTER UPDATE OF status ON public.driver_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_order_event_end_from_collection();
