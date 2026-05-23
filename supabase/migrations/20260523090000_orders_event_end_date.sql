-- Multi-day events. Single event_date assumed an event finished
-- the same day it started; festivals, multi-day weddings, corporate
-- retreats all needed splitting across rows or stuffing into notes.
--
-- New shape:
--   event_date     = first day (start)
--   event_end_date = last day (inclusive)
-- For single-day events both columns hold the same date.
--
-- Migration is additive + backfilled to event_date so existing
-- consumers (calendar, dispatch queue, live ops, tracking) keep
-- reading event_date as before. New surfaces can read end_date
-- and render the span.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS event_end_date date;

UPDATE public.orders
  SET event_end_date = event_date
  WHERE event_end_date IS NULL;

-- Belt-and-braces trigger: if a writer forgets to set end_date,
-- default it to event_date. Also clamp to prevent end < start
-- (caller bug, easier to fix here than in every form).
CREATE OR REPLACE FUNCTION public.normalize_orders_event_end_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_end_date IS NULL THEN
    NEW.event_end_date := NEW.event_date;
  ELSIF NEW.event_date IS NOT NULL AND NEW.event_end_date < NEW.event_date THEN
    NEW.event_end_date := NEW.event_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_orders_event_end_date_trg ON public.orders;
CREATE TRIGGER normalize_orders_event_end_date_trg
BEFORE INSERT OR UPDATE OF event_date, event_end_date ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.normalize_orders_event_end_date();

CREATE INDEX IF NOT EXISTS idx_orders_event_end_date
  ON public.orders(event_end_date);
