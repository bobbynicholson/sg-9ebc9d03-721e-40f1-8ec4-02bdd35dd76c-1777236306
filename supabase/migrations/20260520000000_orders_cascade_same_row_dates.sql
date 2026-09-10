-- Companion to tg_orders_cascade_datetime_change: same-row shift.
-- When event_date or event_time moves, the existing trigger handles
-- downstream tables but cannot touch NEW on the same orders row
-- (it's AFTER UPDATE). This BEFORE UPDATE trigger fills the gap:
-- it shifts balance_due_date and collection_time on the order row
-- itself by the same delta - BUT only when the caller didn't
-- explicitly change those columns in the same update (heuristic:
-- NEW.value == OLD.value). That way an intentional balance-due
-- shift in the same admin save isn't silently overwritten.

CREATE OR REPLACE FUNCTION public.tg_orders_shift_same_row_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_ts TIMESTAMPTZ;
  v_new_ts TIMESTAMPTZ;
  v_delta_seconds NUMERIC;
BEGIN
  IF OLD.event_date IS NOT DISTINCT FROM NEW.event_date
     AND OLD.event_time IS NOT DISTINCT FROM NEW.event_time THEN
    RETURN NEW;
  END IF;

  v_old_ts := (OLD.event_date::text || ' ' || COALESCE(OLD.event_time::text, '12:00:00'))::TIMESTAMPTZ;
  v_new_ts := (NEW.event_date::text || ' ' || COALESCE(NEW.event_time::text, '12:00:00'))::TIMESTAMPTZ;
  v_delta_seconds := EXTRACT(EPOCH FROM (v_new_ts - v_old_ts));
  IF v_delta_seconds = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.balance_due_date IS NOT NULL
     AND NEW.balance_due_date = OLD.balance_due_date THEN
    NEW.balance_due_date := NEW.balance_due_date + make_interval(secs => v_delta_seconds);
  END IF;

  IF NEW.collection_time IS NOT NULL
     AND NEW.collection_time = OLD.collection_time THEN
    NEW.collection_time := NEW.collection_time + make_interval(secs => v_delta_seconds);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_shift_same_row_dates ON public.orders;
CREATE TRIGGER trg_orders_shift_same_row_dates
  BEFORE UPDATE OF event_date, event_time ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.event_date IS DISTINCT FROM NEW.event_date
    OR OLD.event_time IS DISTINCT FROM NEW.event_time
  )
  EXECUTE FUNCTION public.tg_orders_shift_same_row_dates();

COMMENT ON FUNCTION public.tg_orders_shift_same_row_dates() IS
  'BEFORE UPDATE companion to tg_orders_cascade_datetime_change. Shifts balance_due_date and collection_time on the same row when event_date / event_time moves, unless the caller explicitly set those columns in the same UPDATE.';
