-- Copy the waiter's "Service started" onto orders.service_started_at.
--
-- Food service is the waiter's checkpoint. The driver's run sheet
-- (DriverConfirmationPanel) used to have its own "Service started" tap,
-- which stamped orders.service_started_at via tg_stamp_order_event_day;
-- that step is removed from the driver side. The waiter panel records the
-- moment on event_attendance.service_started_at (one row per waiter), but
-- the order timelines, order document and client pages read the orders
-- column - so without this the step would stay blank.
--
-- AFTER INSERT / UPDATE OF service_started_at on event_attendance stamps
-- the order with the earliest waiter value (a later tap by a second waiter
-- never moves it forward). SECURITY DEFINER so it runs regardless of the waiter's
-- RLS on orders, and sets app.trusted_order_stamp so the orders column
-- whitelist (which has no waiter path) lets the stamp through (20261007115900).
--
-- Idempotent - safe to run repeatedly.

CREATE OR REPLACE FUNCTION public.stamp_order_service_started_from_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_id IS NULL OR NEW.service_started_at IS NULL THEN
    RETURN NEW;
  END IF;
  -- Waiters have no write path on orders; the whitelist lets this one
  -- stamp through (20261007115900). Flag is transaction-local and reset.
  PERFORM set_config('app.trusted_order_stamp', 'on', true);
  UPDATE public.orders
     SET service_started_at = NEW.service_started_at
   WHERE id = NEW.order_id
     AND (service_started_at IS NULL OR service_started_at > NEW.service_started_at);
  PERFORM set_config('app.trusted_order_stamp', 'off', true);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_stamp_order_service_started ON public.event_attendance;
CREATE TRIGGER tg_stamp_order_service_started
  AFTER INSERT OR UPDATE OF service_started_at ON public.event_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_order_service_started_from_attendance();

-- Backfill orders whose waiters recorded service start but whose order
-- column is still empty.
UPDATE public.orders o
   SET service_started_at = a.ts
  FROM (
    SELECT order_id, MIN(service_started_at) AS ts
    FROM public.event_attendance
    WHERE service_started_at IS NOT NULL
    GROUP BY order_id
  ) a
 WHERE o.id = a.order_id AND o.service_started_at IS NULL;
