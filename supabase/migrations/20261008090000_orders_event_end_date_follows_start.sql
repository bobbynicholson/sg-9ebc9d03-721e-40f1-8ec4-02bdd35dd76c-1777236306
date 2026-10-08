-- Keep orders.event_end_date in step when the event date moves.
--
-- 20260523090000 gave every order event_end_date = event_date and a
-- trigger (normalize_orders_event_end_date) that fills a missing end date
-- and pulls an end date before the start up to the start. It never MOVED
-- the end date with the start, so:
--   - moving an event EARLIER left the end on the old date: ORD-918898
--     moved from 4 Nov to 10 Oct and the calendar drew it as a 26-day
--     booking ("Day 1 ... Day 26");
--   - moving a multi-day event LATER squashed it to one day.
--
-- Fix: the same trigger function, now shifting the end date by the number
-- of days the start moved when the update didn't deliberately set a new
-- end date. Single-day events stay single-day; multi-day events keep their
-- length. Missing / earlier-than-start end dates are handled as before.
-- Covers every path that moves an order's date (quote edit, order edit,
-- amendment, postpone).
--
-- Idempotent - safe to run repeatedly.

CREATE OR REPLACE FUNCTION public.normalize_orders_event_end_date()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Start moved and the end wasn't changed in the same update: move the
  -- end by the same number of days.
  IF TG_OP = 'UPDATE'
     AND NEW.event_date IS DISTINCT FROM OLD.event_date
     AND OLD.event_date IS NOT NULL
     AND NEW.event_date IS NOT NULL
     AND OLD.event_end_date IS NOT NULL
     AND NEW.event_end_date IS NOT DISTINCT FROM OLD.event_end_date THEN
    NEW.event_end_date := OLD.event_end_date + (NEW.event_date - OLD.event_date);
  END IF;

  IF NEW.event_end_date IS NULL THEN
    NEW.event_end_date := NEW.event_date;
  ELSIF NEW.event_date IS NOT NULL AND NEW.event_end_date < NEW.event_date THEN
    NEW.event_end_date := NEW.event_date;
  END IF;
  RETURN NEW;
END $function$;

-- Same trigger as 20260523090000 (re-created so this file stands alone).
DROP TRIGGER IF EXISTS normalize_orders_event_end_date_trg ON public.orders;
CREATE TRIGGER normalize_orders_event_end_date_trg
BEFORE INSERT OR UPDATE OF event_date, event_end_date ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.normalize_orders_event_end_date();
