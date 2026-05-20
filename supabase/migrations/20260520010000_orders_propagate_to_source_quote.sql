-- Reverse propagation: order -> source quote.
--
-- The existing tg_propagate_quote_edits_to_order trigger pushes
-- quote edits down to the linked order. The reverse direction was
-- missing - when an admin reschedules an order on /admin/orders,
-- the source quote on /admin/quotes stayed pinned to the old
-- event_date / venue / guest_count. Same silent staleness the
-- earlier cascade migrations closed for operational tables.
--
-- Loop protection: pg_trigger_depth() returns 1 for a direct UPDATE
-- and > 1 when nested. We bail when nested so the quote trigger
-- updating orders doesn't kick this trigger which would update
-- quotes and ping-pong forever.

CREATE OR REPLACE FUNCTION public.tg_orders_propagate_to_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_quote_id UUID;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('in_transit', 'delivered', 'completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  v_quote_id := NEW.quote_id;
  IF v_quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.event_date IS DISTINCT FROM NEW.event_date THEN
    UPDATE public.quotes
       SET event_date = NEW.event_date,
           updated_at = NOW()
     WHERE id = v_quote_id
       AND deleted_at IS NULL;
  END IF;

  IF OLD.event_time IS DISTINCT FROM NEW.event_time THEN
    UPDATE public.quotes
       SET event_time = COALESCE(NEW.event_time::text, NULL),
           updated_at = NOW()
     WHERE id = v_quote_id
       AND deleted_at IS NULL;
  END IF;

  IF OLD.guest_count IS DISTINCT FROM NEW.guest_count THEN
    UPDATE public.quotes
       SET guest_count = NEW.guest_count,
           updated_at = NOW()
     WHERE id = v_quote_id
       AND deleted_at IS NULL;
  END IF;

  IF OLD.venue_address IS DISTINCT FROM NEW.venue_address
     OR OLD.venue_lat IS DISTINCT FROM NEW.venue_lat
     OR OLD.venue_lng IS DISTINCT FROM NEW.venue_lng THEN
    UPDATE public.quotes
       SET venue_address = NEW.venue_address,
           venue_lat = NEW.venue_lat,
           venue_lng = NEW.venue_lng,
           updated_at = NOW()
     WHERE id = v_quote_id
       AND deleted_at IS NULL;
  END IF;

  IF OLD.setup_time IS DISTINCT FROM NEW.setup_time THEN
    UPDATE public.quotes
       SET setup_time = NEW.setup_time,
           updated_at = NOW()
     WHERE id = v_quote_id
       AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_propagate_to_quote ON public.orders;
CREATE TRIGGER trg_orders_propagate_to_quote
  AFTER UPDATE OF event_date, event_time, guest_count, venue_address, venue_lat, venue_lng, setup_time ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.event_date    IS DISTINCT FROM NEW.event_date
    OR OLD.event_time IS DISTINCT FROM NEW.event_time
    OR OLD.guest_count IS DISTINCT FROM NEW.guest_count
    OR OLD.venue_address IS DISTINCT FROM NEW.venue_address
    OR OLD.venue_lat IS DISTINCT FROM NEW.venue_lat
    OR OLD.venue_lng IS DISTINCT FROM NEW.venue_lng
    OR OLD.setup_time IS DISTINCT FROM NEW.setup_time
  )
  EXECUTE FUNCTION public.tg_orders_propagate_to_quote();

COMMENT ON FUNCTION public.tg_orders_propagate_to_quote() IS
  'Reverse propagation pair to tg_propagate_quote_edits_to_order. When the order moves (date, time, venue, guests, setup), the linked source quote mirrors the change. pg_trigger_depth() guard prevents ping-pong loops with the forward trigger. Skipped once the order ships (in_transit / delivered / completed / cancelled).';
