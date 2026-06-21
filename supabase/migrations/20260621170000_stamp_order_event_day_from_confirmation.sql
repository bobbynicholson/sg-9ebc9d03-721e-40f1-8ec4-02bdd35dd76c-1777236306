-- Stamp orders.setup_started_at / service_started_at / departed_venue_at
-- from driver_confirmations, via trigger.
--
-- The driver's on-site taps (DriverConfirmationPanel) insert a
-- driver_confirmations row (works - drivers can insert) and THEN tried to
-- UPDATE the matching orders.<col> from the browser. That browser UPDATE
-- silently did not land (the audit rows exist but orders.setup_started_at
-- etc. stayed null), so the admin order timeline - which reads the orders
-- columns - showed those stages as N/A even after the driver tapped them.
--
-- Fix: an AFTER INSERT trigger on driver_confirmations stamps the canonical
-- orders column. SECURITY DEFINER so it runs regardless of the inserting
-- role's RLS. Idempotent per column (only stamps when still null), so it
-- never clobbers an existing value or fights the client update.
--
-- Idempotent migration - safe to run repeatedly.

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
    UPDATE public.orders
       SET departed_venue_at = COALESCE(departed_venue_at, NEW.confirmed_at)
     WHERE id = NEW.order_id AND departed_venue_at IS NULL;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_stamp_order_event_day ON public.driver_confirmations;
CREATE TRIGGER tg_stamp_order_event_day
  AFTER INSERT ON public.driver_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_order_event_day_from_confirmation();

-- Backfill: stamp any orders whose driver_confirmations already recorded
-- these moments but whose orders columns are still null (e.g. ORD-003849).
UPDATE public.orders o
   SET arrived_at_venue_at = c.ts
  FROM (
    SELECT order_id, MIN(confirmed_at) AS ts
    FROM public.driver_confirmations
    WHERE confirmation_type = 'at_venue'
    GROUP BY order_id
  ) c
 WHERE o.id = c.order_id AND o.arrived_at_venue_at IS NULL;

UPDATE public.orders o
   SET setup_started_at = c.ts
  FROM (
    SELECT order_id, MIN(confirmed_at) AS ts
    FROM public.driver_confirmations
    WHERE confirmation_type = 'setup_started'
    GROUP BY order_id
  ) c
 WHERE o.id = c.order_id AND o.setup_started_at IS NULL;

UPDATE public.orders o
   SET service_started_at = c.ts
  FROM (
    SELECT order_id, MIN(confirmed_at) AS ts
    FROM public.driver_confirmations
    WHERE confirmation_type = 'service_started'
    GROUP BY order_id
  ) c
 WHERE o.id = c.order_id AND o.service_started_at IS NULL;

UPDATE public.orders o
   SET departed_venue_at = c.ts
  FROM (
    SELECT order_id, MIN(confirmed_at) AS ts
    FROM public.driver_confirmations
    WHERE confirmation_type = 'departed_venue'
    GROUP BY order_id
  ) c
 WHERE o.id = c.order_id AND o.departed_venue_at IS NULL;
