-- Wave 51 B1 -- belt-and-braces Postgres trigger to mirror quote
-- field changes onto the linked order automatically.

CREATE OR REPLACE FUNCTION public.tg_propagate_quote_edits_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_status text;
  v_event_time time;
BEGIN
  SELECT id, status
  INTO v_order_id, v_order_status
  FROM public.orders
  WHERE quote_id = NEW.id
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_order_status IN ('in_transit', 'delivered', 'completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- quotes.event_time is text; orders.event_time is time. Cast with
  -- NULLIF guard so empty / unparseable strings fall through as NULL
  -- and COALESCE preserves the order's existing time.
  BEGIN
    v_event_time := NULLIF(NEW.event_time, '')::time;
  EXCEPTION WHEN OTHERS THEN
    v_event_time := NULL;
  END;

  UPDATE public.orders SET
    event_date           = COALESCE(NEW.event_date,           event_date),
    event_time           = COALESCE(v_event_time,             event_time),
    setup_time           = COALESCE(NEW.setup_time,           setup_time),
    guest_count          = COALESCE(NEW.guest_count,          guest_count),
    venue_address        = COALESCE(NEW.venue_address,        venue_address),
    venue_lat            = COALESCE(NEW.venue_lat,            venue_lat),
    venue_lng            = COALESCE(NEW.venue_lng,            venue_lng),
    client_name          = COALESCE(NEW.client_name,          client_name),
    client_email         = COALESCE(NEW.client_email,         client_email),
    client_phone         = COALESCE(NEW.client_phone,         client_phone),
    event_name           = COALESCE(NEW.quote_name,           event_name),
    subtotal             = COALESCE(NEW.subtotal,             subtotal),
    discount_amount      = COALESCE(NEW.discount_amount,      discount_amount),
    tax_amount           = COALESCE(NEW.tax_amount,           tax_amount),
    tax                  = COALESCE(NEW.tax,                  tax),
    total_amount         = COALESCE(NEW.total,                total_amount),
    deposit_percentage   = COALESCE(NEW.deposit_percentage,   deposit_percentage),
    delivery_fee         = COALESCE(NEW.delivery_fee,         delivery_fee),
    delivery_distance_km = COALESCE(NEW.delivery_distance_km, delivery_distance_km),
    delivery_rate_per_km = COALESCE(NEW.delivery_rate_per_km, delivery_rate_per_km),
    region_id            = COALESCE(NEW.region_id,            region_id),
    updated_at           = NOW()
  WHERE id = v_order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_quote_edits ON public.quotes;
CREATE TRIGGER trg_propagate_quote_edits
  AFTER UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_propagate_quote_edits_to_order();

COMMENT ON FUNCTION public.tg_propagate_quote_edits_to_order() IS
  'Wave 51 B1 -- belt-and-braces. Mirrors quote field changes onto the linked order so even direct supabase.update calls keep the two rows in sync. Smart cascades (kitchen prep re-plan, equipment diff, collection re-stamp, pre-event reminder re-window) live in propagateQuoteEditToOrder.ts and run from the service layer.';
