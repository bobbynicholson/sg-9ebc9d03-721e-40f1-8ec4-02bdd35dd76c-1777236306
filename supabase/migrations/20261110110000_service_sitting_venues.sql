BEGIN;

-- A sitting may override the parent booking venue. NULL remains meaningful:
-- it inherits the legacy quote/order venue, so existing bookings need no data
-- rewrite and keep their current address behavior.
ALTER TABLE public.service_sittings
  ADD COLUMN IF NOT EXISTS venue_name text,
  ADD COLUMN IF NOT EXISTS venue_address text,
  ADD COLUMN IF NOT EXISTS venue_lat double precision,
  ADD COLUMN IF NOT EXISTS venue_lng double precision;

ALTER TABLE public.service_sittings
  DROP CONSTRAINT IF EXISTS service_sittings_venue_name_length,
  ADD CONSTRAINT service_sittings_venue_name_length CHECK (venue_name IS NULL OR length(venue_name) <= 200),
  DROP CONSTRAINT IF EXISTS service_sittings_venue_address_length,
  ADD CONSTRAINT service_sittings_venue_address_length CHECK (venue_address IS NULL OR length(venue_address) <= 500),
  DROP CONSTRAINT IF EXISTS service_sittings_venue_coordinates_pair,
  ADD CONSTRAINT service_sittings_venue_coordinates_pair CHECK (
    (venue_lat IS NULL AND venue_lng IS NULL)
    OR (venue_lat IS NOT NULL AND venue_lng IS NOT NULL AND venue_lat BETWEEN -90 AND 90 AND venue_lng BETWEEN -180 AND 180)
  );
ALTER TABLE public.quote_change_requests
  ADD COLUMN IF NOT EXISTS reviewed_service_sittings jsonb;

-- Apply saved quote locations after the existing atomic quote-plan function
-- has validated and upserted sitting counts/times.
CREATE OR REPLACE FUNCTION public.apply_quote_sitting_venues(
  p_quote_id uuid, p_company_id uuid, p_plan jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  item jsonb;
  seq integer := 0;
  s public.service_sittings%ROWTYPE;
  venue_name_value text;
  venue_address_value text;
  lat_value double precision;
  lng_value double precision;
  has_name boolean;
  has_address boolean;
  has_lat boolean;
  has_lng boolean;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id=p_quote_id AND company_id=p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Quote not found for sitting locations.'; END IF;
  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid sitting locations.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_plan) LOOP
    seq := seq + 1;
    SELECT * INTO s FROM public.service_sittings WHERE quote_id=q.id AND company_id=q.company_id AND sequence_number=seq FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting location does not match the saved quote plan.'; END IF;
    has_name := item ? 'venueName' OR item ? 'venue_name';
    has_address := item ? 'venueAddress' OR item ? 'venue_address';
    has_lat := item ? 'venueLat' OR item ? 'venue_lat';
    has_lng := item ? 'venueLng' OR item ? 'venue_lng';
    venue_name_value := CASE WHEN item ? 'venueName' THEN nullif(btrim(item->>'venueName'),'') WHEN item ? 'venue_name' THEN nullif(btrim(item->>'venue_name'),'') ELSE s.venue_name END;
    venue_address_value := CASE WHEN item ? 'venueAddress' THEN nullif(btrim(item->>'venueAddress'),'') WHEN item ? 'venue_address' THEN nullif(btrim(item->>'venue_address'),'') ELSE s.venue_address END;
    IF venue_name_value IS NOT NULL AND length(venue_name_value)>200 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting venue name must be 200 characters or fewer.'; END IF;
    IF venue_address_value IS NOT NULL AND length(venue_address_value)>500 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting address must be 500 characters or fewer.'; END IF;
    lat_value := CASE WHEN has_lat THEN nullif(coalesce(item->>'venueLat',item->>'venue_lat'),'')::double precision ELSE s.venue_lat END;
    lng_value := CASE WHEN has_lng THEN nullif(coalesce(item->>'venueLng',item->>'venue_lng'),'')::double precision ELSE s.venue_lng END;
    IF (lat_value IS NULL) <> (lng_value IS NULL) OR (lat_value IS NOT NULL AND (lat_value NOT BETWEEN -90 AND 90 OR lng_value NOT BETWEEN -180 AND 180)) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose a valid map location for each sitting, or enter its address manually.';
    END IF;
    UPDATE public.service_sittings SET venue_name=venue_name_value,venue_address=venue_address_value,venue_lat=lat_value,venue_lng=lng_value WHERE id=s.id;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.apply_quote_sitting_venues(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_quote_sitting_venues(uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.save_admin_quote_service_plan_with_venues(
  p_quote_id uuid, p_company_id uuid, p_plan jsonb, p_patch jsonb DEFAULT '{}', p_request_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.save_admin_quote_service_plan(p_quote_id,p_company_id,p_plan,p_patch,p_request_id);
  PERFORM public.apply_quote_sitting_venues(p_quote_id,p_company_id,p_plan);
END; $$;
REVOKE ALL ON FUNCTION public.save_admin_quote_service_plan_with_venues(uuid,uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_quote_service_plan_with_venues(uuid,uuid,jsonb,jsonb,uuid) TO service_role;

-- Customer change requests may only change serving times until an admin
-- reviews them. Upsert by sequence so older requests that omit location
-- fields preserve the already agreed sitting address.
CREATE OR REPLACE FUNCTION public.apply_addressed_quote_service_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_plan jsonb := NEW.reviewed_service_sittings;
  v_quote public.quotes%ROWTYPE;
  v_sitting jsonb;
  v_guests numeric;
  v_total numeric := 0;
  v_sequence integer := 0;
BEGIN
  IF v_plan IS NULL OR v_plan='null'::jsonb THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quote_change_requests r
    WHERE r.quote_id=NEW.quote_id AND r.company_id=NEW.company_id AND r.status<>'dismissed'
      AND r.reviewed_service_sittings IS NOT NULL AND r.reviewed_service_sittings<>'null'::jsonb
      AND (r.created_at,r.id)>(NEW.created_at,NEW.id)
  ) THEN RETURN NEW; END IF;
  SELECT * INTO v_quote FROM public.quotes WHERE id=NEW.quote_id AND company_id=NEW.company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Quote not found for this serving plan.'; END IF;
  IF v_quote.converted_to_order_id IS NOT NULL OR v_quote.status='accepted' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Please change serving times from the existing booking.'; END IF;
  IF jsonb_typeof(v_plan)<>'array' OR jsonb_array_length(v_plan) NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose between one and twelve service sittings.'; END IF;
  FOR v_sitting IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
    IF jsonb_typeof(v_sitting->'guestCount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Every sitting needs a valid guest count.'; END IF;
    v_guests := (v_sitting->>'guestCount')::numeric;
    IF v_guests<1 OR v_guests>2147483647 OR v_guests<>trunc(v_guests) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Every sitting needs a valid guest count.'; END IF;
    v_total := v_total+v_guests;
    IF coalesce(v_sitting->>'serviceTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Every sitting needs a valid service time.'; END IF;
    v_sequence := v_sequence+1;
    INSERT INTO public.service_sittings(company_id,quote_id,sequence_number,guest_count,service_time)
      VALUES(v_quote.company_id,v_quote.id,v_sequence,v_guests::integer,(v_sitting->>'serviceTime')::time)
      ON CONFLICT(quote_id,sequence_number) DO UPDATE SET guest_count=excluded.guest_count,service_time=excluded.service_time;
  END LOOP;
  IF v_total IS DISTINCT FROM v_quote.guest_count::numeric THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Serving-plan guests must match the revised quote. Update the plan before addressing this request.'; END IF;
  DELETE FROM public.service_sittings WHERE quote_id=v_quote.id AND order_id IS NULL AND sequence_number>v_sequence;
  PERFORM public.apply_quote_sitting_venues(v_quote.id,v_quote.company_id,v_plan);
  UPDATE public.quotes SET event_time=(v_plan->0->>'serviceTime')::time,updated_at=now() WHERE id=v_quote.id;
  RETURN NEW;
END; $$;

-- Validate and persist location overrides inside the same database
-- transaction as the existing sitting/driver schedule writes.
CREATE OR REPLACE FUNCTION public.apply_order_sitting_venues(
  p_order_id uuid, p_company_id uuid, p_operations jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  o public.orders%ROWTYPE;
  op jsonb;
  s public.service_sittings%ROWTYPE;
  venue_name_value text;
  venue_address_value text;
  lat_value double precision;
  lng_value double precision;
  location_changed boolean := false;
  has_name boolean;
  has_address boolean;
  has_lat boolean;
  has_lng boolean;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND company_id=p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Booking not found for sitting locations.'; END IF;
  IF jsonb_typeof(p_operations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid sitting locations.'; END IF;
  FOR op IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
    SELECT * INTO s FROM public.service_sittings WHERE id=(op->>'id')::uuid AND order_id=o.id AND company_id=o.company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting location does not belong to this booking.'; END IF;
    has_name := op ? 'venueName' OR op ? 'venue_name'; has_address := op ? 'venueAddress' OR op ? 'venue_address';
    has_lat := op ? 'venueLat' OR op ? 'venue_lat'; has_lng := op ? 'venueLng' OR op ? 'venue_lng';
    venue_name_value := CASE WHEN op ? 'venueName' THEN nullif(btrim(op->>'venueName'),'') WHEN op ? 'venue_name' THEN nullif(btrim(op->>'venue_name'),'') ELSE s.venue_name END;
    venue_address_value := CASE WHEN op ? 'venueAddress' THEN nullif(btrim(op->>'venueAddress'),'') WHEN op ? 'venue_address' THEN nullif(btrim(op->>'venue_address'),'') ELSE s.venue_address END;
    IF venue_name_value IS NOT NULL AND length(venue_name_value)>200 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting venue name must be 200 characters or fewer.'; END IF;
    IF venue_address_value IS NOT NULL AND length(venue_address_value)>500 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting address must be 500 characters or fewer.'; END IF;
    lat_value := CASE WHEN has_lat THEN nullif(coalesce(op->>'venueLat',op->>'venue_lat'),'')::double precision ELSE s.venue_lat END;
    lng_value := CASE WHEN has_lng THEN nullif(coalesce(op->>'venueLng',op->>'venue_lng'),'')::double precision ELSE s.venue_lng END;
    IF (lat_value IS NULL) <> (lng_value IS NULL) OR (lat_value IS NOT NULL AND (lat_value NOT BETWEEN -90 AND 90 OR lng_value NOT BETWEEN -180 AND 180)) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose a valid map location for each sitting, or enter its address manually.';
    END IF;
    IF (coalesce(s.venue_name,o.venue_name) IS DISTINCT FROM coalesce(venue_name_value,o.venue_name)
      OR coalesce(s.venue_address,o.venue_address) IS DISTINCT FROM coalesce(venue_address_value,o.venue_address)
      OR coalesce(s.venue_lat,o.venue_lat) IS DISTINCT FROM coalesce(lat_value,o.venue_lat)
      OR coalesce(s.venue_lng,o.venue_lng) IS DISTINCT FROM coalesce(lng_value,o.venue_lng)) THEN
      IF s.status<>'planned'
        OR EXISTS(SELECT 1 FROM public.kitchen_prep_tasks k WHERE k.service_sitting_id=s.id AND k.company_id=o.company_id AND k.deleted_at IS NULL AND (k.status<>'pending' OR k.started_at IS NOT NULL))
        OR EXISTS(SELECT 1 FROM public.driver_assignments a WHERE a.service_sitting_id=s.id AND a.company_id=o.company_id AND a.status::text NOT IN ('assigned','accepted','cancelled','rejected')) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Kitchen work or a sitting trip has started. Contact the team before changing its delivery address.';
      END IF;
      location_changed := true;
    END IF;
    UPDATE public.service_sittings SET venue_name=venue_name_value,venue_address=venue_address_value,venue_lat=lat_value,venue_lng=lng_value WHERE id=s.id;
  END LOOP;
  RETURN location_changed;
END; $$;
REVOKE ALL ON FUNCTION public.apply_order_sitting_venues(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_sitting_venues(uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.save_order_sitting_operations_with_venues(
  p_order_id uuid, p_company_id uuid, p_operations jsonb, p_return_plan text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.save_order_sitting_operations(p_order_id,p_company_id,p_operations,p_return_plan);
  PERFORM public.apply_order_sitting_venues(p_order_id,p_company_id,p_operations);
END; $$;
REVOKE ALL ON FUNCTION public.save_order_sitting_operations_with_venues(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_sitting_operations_with_venues(uuid,uuid,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.save_admin_order_service_plan_with_venues(
  p_order_id uuid, p_company_id uuid, p_operations jsonb, p_return_plan text, p_kitchen_tasks jsonb DEFAULT '[]'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  location_changed boolean;
  task jsonb;
BEGIN
  PERFORM public.save_admin_order_service_plan(p_order_id,p_company_id,p_operations,p_return_plan,p_kitchen_tasks);
  location_changed := public.apply_order_sitting_venues(p_order_id,p_company_id,p_operations);
  IF location_changed THEN
    UPDATE public.kitchen_prep_tasks SET deleted_at=now()
      WHERE order_id=p_order_id AND company_id=p_company_id AND deleted_at IS NULL AND status='pending' AND started_at IS NULL;
    IF jsonb_typeof(p_kitchen_tasks) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='The kitchen plan could not be validated. Please retry.'; END IF;
    FOR task IN SELECT value FROM jsonb_array_elements(p_kitchen_tasks) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.service_sittings WHERE id=(task->>'service_sitting_id')::uuid AND order_id=p_order_id AND company_id=p_company_id) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A kitchen batch does not belong to this booking.';
      END IF;
      INSERT INTO public.kitchen_prep_tasks(company_id,order_id,region_id,service_sitting_id,menu_item_name,task_type,start_at,duration_min,status,notes,planned_yield,yield_unit)
        SELECT p_company_id,p_order_id,o.region_id,(task->>'service_sitting_id')::uuid,left(task->>'menu_item_name',200),task->>'task_type',
          (task->>'start_at')::timestamptz,(task->>'duration_min')::integer,'pending',left(task->>'notes',2000),
          nullif(task->>'planned_yield','')::numeric,task->>'yield_unit'
        FROM public.orders o WHERE o.id=p_order_id AND o.company_id=p_company_id;
    END LOOP;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.save_admin_order_service_plan_with_venues(uuid,uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_order_service_plan_with_venues(uuid,uuid,jsonb,text,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
