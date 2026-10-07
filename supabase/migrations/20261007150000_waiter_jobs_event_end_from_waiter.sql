-- Waiter-run jobs: the event end comes from the waiter, not the driver.
--
-- On a job with a waiter there is no collection trip (the waiter brings
-- the gear back), so 20261007130000 still let the driver's "Departed
-- venue" stamp orders.service_ended_at / event_complete_at. But the
-- driver usually drops off and leaves before the event; the waiter
-- records the real "Service ended" / "Event complete" later, on
-- event_attendance. Until then the order showed the drop-off time as the
-- event end (and pages reading the orders columns kept showing it).
--
-- Fix:
--   1. 'departed_venue' only stamps the event end when there is no
--      collection trip AND no waiter on the job (requires_waiter,
--      waiter_service_required, or any event_attendance row) - i.e. the
--      driver really did stay to the end.
--   2. The waiter attendance trigger (20261007120000) now also copies
--      service_ended_at and event_complete_at onto the order (earliest
--      waiter value, matching the order timeline), next to
--      service_started_at. These three columns are the ones the orders
--      whitelist trusted-stamp path allows (20261007115900).
--   3. Backfill: orders whose waiters already recorded these moments get
--      the waiter's values (only where the order column is empty).
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

    -- The departure is only the event end when the driver stayed: no
    -- collection trip coming, and no waiter recording the real end.
    IF NOT EXISTS (
         SELECT 1 FROM public.driver_assignments da
          WHERE da.order_id = NEW.order_id
            AND da.assignment_type = 'collection'
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.event_attendance ea
          WHERE ea.order_id = NEW.order_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.orders o
          WHERE o.id = NEW.order_id
            AND (COALESCE(o.requires_waiter, false) OR COALESCE(o.waiter_service_required, false))
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

-- Waiter attendance -> order: service started, service ended, event
-- complete. Earliest waiter value wins (a later tap by a second waiter
-- never moves it forward).
CREATE OR REPLACE FUNCTION public.stamp_order_service_started_from_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_id IS NULL
     OR (NEW.service_started_at IS NULL
         AND NEW.service_ended_at IS NULL
         AND NEW.event_complete_at IS NULL) THEN
    RETURN NEW;
  END IF;
  -- Waiters have no write path on orders; the whitelist lets these three
  -- stamps through (20261007115900). Flag is transaction-local and reset.
  PERFORM set_config('app.trusted_order_stamp', 'on', true);
  UPDATE public.orders o
     SET service_started_at = CASE
           WHEN NEW.service_started_at IS NOT NULL
                AND (o.service_started_at IS NULL OR o.service_started_at > NEW.service_started_at)
           THEN NEW.service_started_at ELSE o.service_started_at END,
         service_ended_at = CASE
           WHEN NEW.service_ended_at IS NOT NULL
                AND (o.service_ended_at IS NULL OR o.service_ended_at > NEW.service_ended_at)
           THEN NEW.service_ended_at ELSE o.service_ended_at END,
         event_complete_at = CASE
           WHEN NEW.event_complete_at IS NOT NULL
                AND (o.event_complete_at IS NULL OR o.event_complete_at > NEW.event_complete_at)
           THEN NEW.event_complete_at ELSE o.event_complete_at END
   WHERE o.id = NEW.order_id
     AND (
       (NEW.service_started_at IS NOT NULL AND (o.service_started_at IS NULL OR o.service_started_at > NEW.service_started_at))
       OR (NEW.service_ended_at IS NOT NULL AND (o.service_ended_at IS NULL OR o.service_ended_at > NEW.service_ended_at))
       OR (NEW.event_complete_at IS NOT NULL AND (o.event_complete_at IS NULL OR o.event_complete_at > NEW.event_complete_at))
     );
  PERFORM set_config('app.trusted_order_stamp', 'off', true);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_stamp_order_service_started ON public.event_attendance;
CREATE TRIGGER tg_stamp_order_service_started
  AFTER INSERT OR UPDATE OF service_started_at, service_ended_at, event_complete_at
  ON public.event_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_order_service_started_from_attendance();

-- Backfill from existing waiter records (only empty order columns).
UPDATE public.orders o
   SET service_ended_at  = COALESCE(o.service_ended_at,  a.ended),
       event_complete_at = COALESCE(o.event_complete_at, a.complete)
  FROM (
    SELECT order_id, MIN(service_ended_at) AS ended, MIN(event_complete_at) AS complete
    FROM public.event_attendance
    GROUP BY order_id
  ) a
 WHERE o.id = a.order_id
   AND ((o.service_ended_at IS NULL AND a.ended IS NOT NULL)
        OR (o.event_complete_at IS NULL AND a.complete IS NOT NULL));
