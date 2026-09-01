-- Keep quote-stage waiter pricing and requirement aligned with its linked
-- order when an operator edits a converted quote.
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
  SELECT id, status INTO v_order_id, v_order_status
  FROM public.orders
  WHERE quote_id = NEW.id AND deleted_at IS NULL
  LIMIT 1;

  IF v_order_id IS NULL OR v_order_status IN ('in_transit', 'delivered', 'completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_event_time := NULLIF(NEW.event_time, '')::time;
  EXCEPTION WHEN OTHERS THEN
    v_event_time := NULL;
  END;

  UPDATE public.orders SET
    event_date = COALESCE(NEW.event_date, event_date),
    event_time = COALESCE(v_event_time, event_time),
    setup_time = COALESCE(NEW.setup_time, setup_time),
    guest_count = COALESCE(NEW.guest_count, guest_count),
    venue_address = COALESCE(NEW.venue_address, venue_address),
    venue_lat = COALESCE(NEW.venue_lat, venue_lat),
    venue_lng = COALESCE(NEW.venue_lng, venue_lng),
    client_name = COALESCE(NEW.client_name, client_name),
    client_email = COALESCE(NEW.client_email, client_email),
    client_phone = COALESCE(NEW.client_phone, client_phone),
    event_name = COALESCE(NEW.quote_name, event_name),
    subtotal = COALESCE(NEW.subtotal, subtotal),
    discount_amount = COALESCE(NEW.discount_amount, discount_amount),
    tax_amount = COALESCE(NEW.tax_amount, tax_amount),
    tax = COALESCE(NEW.tax, tax),
    total_amount = COALESCE(NEW.total, total_amount),
    deposit_percentage = COALESCE(NEW.deposit_percentage, deposit_percentage),
    delivery_fee = COALESCE(NEW.delivery_fee, delivery_fee),
    delivery_distance_km = COALESCE(NEW.delivery_distance_km, delivery_distance_km),
    delivery_rate_per_km = COALESCE(NEW.delivery_rate_per_km, delivery_rate_per_km),
    collection_fee = COALESCE(NEW.collection_fee, collection_fee),
    collection_distance_km = COALESCE(NEW.collection_distance_km, collection_distance_km),
    collection_rate_per_km = COALESCE(NEW.collection_rate_per_km, collection_rate_per_km),
    collection_next_day = COALESCE(NEW.collection_next_day, collection_next_day),
    region_id = COALESCE(NEW.region_id, region_id),
    requires_waiter = COALESCE(NEW.waiter_service_required, requires_waiter),
    waiter_service_required = COALESCE(NEW.waiter_service_required, waiter_service_required),
    waiter_count = COALESCE(NEW.waiter_count, waiter_count),
    waiter_duration_hours = NEW.waiter_duration_hours,
    waiter_hourly_rate = NEW.waiter_hourly_rate,
    waiter_total_fee = COALESCE(NEW.waiter_total_fee, waiter_total_fee),
    updated_at = NOW()
  WHERE id = v_order_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_propagate_quote_edits_to_order() IS
  'Mirrors quote booking, totals, and waiter-service fields into the linked order for non-dispatched orders.';
