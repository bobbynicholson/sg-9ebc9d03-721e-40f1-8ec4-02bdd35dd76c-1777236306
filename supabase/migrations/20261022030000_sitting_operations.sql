BEGIN;
ALTER TABLE public.quote_change_requests ADD COLUMN IF NOT EXISTS reviewed_service_sittings jsonb;
ALTER TABLE public.service_sittings ADD COLUMN IF NOT EXISTS return_date date;

-- The original request stays intact; the administrator's reviewed plan is
-- recorded separately. Quote content and serving rows commit together.
CREATE OR REPLACE FUNCTION public.save_admin_quote_service_plan(
  p_quote_id uuid, p_company_id uuid, p_plan jsonb, p_patch jsonb DEFAULT '{}', p_request_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE; item jsonb; guests numeric; total numeric := 0;
  seq integer := 0; assignments text; key text;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id=p_quote_id AND company_id=p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR q.converted_to_order_id IS NOT NULL OR q.status='accepted' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Serving times must be changed from the existing booking once accepted.';
  END IF;
  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose between one and twelve service sittings.';
  END IF;
  IF p_patch->>'status' IS NOT NULL AND p_patch->>'status' NOT IN ('draft','sent') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Only an unaccepted quote can use this editor.'; END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid quote changes.'; END IF;
  -- Only existing editable columns can enter the update. Identifier quoting
  -- is mandatory here; values are always parameters, never SQL fragments.
  FOR key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF key = ANY(ARRAY['id','company_id','public_token','converted_to_order_id','created_at','user_id','prepared_by','quote_number'])
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.quotes'::regclass AND attname=key AND attnum>0 AND NOT attisdropped) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This quote field cannot be changed with the serving plan.';
    END IF;
  END LOOP;
  guests := coalesce((p_patch->>'guest_count')::numeric, q.guest_count);
  FOR item IN SELECT value FROM jsonb_array_elements(p_plan) LOOP
    IF jsonb_typeof(item->'guestCount') IS DISTINCT FROM 'number'
      OR coalesce(item->>'serviceTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR (item->>'guestCount')::numeric < 1 OR (item->>'guestCount')::numeric <> trunc((item->>'guestCount')::numeric) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Every sitting needs a whole guest count and a valid service time.';
    END IF;
    total := total + (item->>'guestCount')::numeric;
  END LOOP;
  IF total IS DISTINCT FROM guests THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Sitting guests must match the quote guest count.'; END IF;
  IF p_request_id IS NOT NULL THEN
    UPDATE public.quote_change_requests SET reviewed_service_sittings=p_plan
      WHERE id=p_request_id AND quote_id=q.id AND company_id=q.company_id AND status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This change request is no longer pending. Reopen the quote to review the saved plan.'; END IF;
  END IF;
  SELECT string_agg(format('%I = (jsonb_populate_record(NULL::public.quotes, $1)).%I', k, k), ', ')
    INTO assignments FROM jsonb_object_keys(p_patch) k;
  IF assignments IS NOT NULL THEN
    EXECUTE 'UPDATE public.quotes SET ' || assignments || ' WHERE id=$2 AND company_id=$3' USING p_patch,q.id,q.company_id;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_plan) LOOP
    seq := seq+1;
    INSERT INTO public.service_sittings(company_id,quote_id,sequence_number,guest_count,service_time)
      VALUES(q.company_id,q.id,seq,(item->>'guestCount')::integer,(item->>'serviceTime')::time)
      ON CONFLICT(quote_id,sequence_number) DO UPDATE SET guest_count=excluded.guest_count,service_time=excluded.service_time;
  END LOOP;
  DELETE FROM public.service_sittings WHERE quote_id=q.id AND order_id IS NULL AND sequence_number>seq;
  UPDATE public.quotes SET event_time=(p_plan->0->>'serviceTime')::time,updated_at=now() WHERE id=q.id;
END; $$;
REVOKE ALL ON FUNCTION public.save_admin_quote_service_plan(uuid,uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_quote_service_plan(uuid,uuid,jsonb,jsonb,uuid) TO service_role;

-- All sittings and both trip legs save together. Started trips cannot be
-- removed, rescheduled or silently given to somebody else.
CREATE OR REPLACE FUNCTION public.save_order_sitting_operations(
  p_order_id uuid, p_company_id uuid, p_operations jsonb, p_return_plan text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  o public.orders%ROWTYPE; s public.service_sittings%ROWTYPE; op jsonb;
  leg text; ids jsonb; driver uuid; at_time timestamptz; zone text;
  expected integer; actual integer; t text; req boolean; last_seq integer;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND company_id=p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR o.status::text IN ('cancelled','completed','postponed') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This booking cannot be scheduled.'; END IF;
  IF p_return_plan IS NULL OR p_return_plan NOT IN ('final_collection','per_sitting_collection','on_site_return','client_return') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose an equipment-return plan.';
  END IF;
  SELECT count(*),max(sequence_number) INTO expected,last_seq FROM public.service_sittings WHERE order_id=o.id AND company_id=o.company_id;
  IF expected < 1 OR jsonb_typeof(p_operations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_operations) <> expected THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Reload the complete sitting plan before saving.';
  END IF;
  SELECT count(DISTINCT value->>'id') INTO actual FROM jsonb_array_elements(p_operations);
  IF actual<>expected THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Each sitting must appear exactly once.'; END IF;
  IF EXISTS(SELECT 1 FROM public.driver_assignments WHERE order_id=o.id AND service_sitting_id IS NULL AND status::text NOT IN ('assigned','accepted','cancelled','rejected')) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='An existing whole-booking trip has already started. Contact dispatch before replacing it with sitting trips.';
  END IF;
  SELECT coalesce(timezone,'Africa/Johannesburg') INTO zone FROM public.companies WHERE id=o.company_id;
  FOR op IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
    SELECT * INTO s FROM public.service_sittings WHERE id=(op->>'id')::uuid AND order_id=o.id AND company_id=o.company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting does not belong to this booking.'; END IF;
    IF op->>'updated_at' IS NOT NULL AND (op->>'updated_at')::timestamptz IS DISTINCT FROM s.updated_at THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Another team member updated this schedule. Reload the saved schedule before editing.'; END IF;
    FOREACH t IN ARRAY ARRAY['kitchenReadyTime','dispatchTime','returnTime'] LOOP
      IF coalesce(op->>t,'')<>'' AND (op->>t) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Use a valid time for each deadline.';
      END IF;
    END LOOP;
    IF nullif(op->>'dispatchTime','')::time > s.service_time OR nullif(op->>'kitchenReadyTime','')::time > s.service_time
      OR nullif(op->>'kitchenReadyTime','')::time > nullif(op->>'dispatchTime','')::time THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Kitchen ready and departure must be before the sitting service time.';
    END IF;
    req := p_return_plan='per_sitting_collection' OR (p_return_plan='final_collection' AND s.sequence_number=last_seq);
    IF req AND (nullif(op->>'returnTime','') IS NULL OR nullif(op->>'returnDate','') IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose the date and time for each equipment collection.';
    END IF;
    IF req AND ((op->>'returnDate')::date < o.event_date::date OR ((op->>'returnDate')::date=o.event_date::date AND (op->>'returnTime')::time < CASE WHEN p_return_plan='final_collection' THEN (SELECT max(service_time) FROM public.service_sittings WHERE order_id=o.id AND status<>'cancelled') ELSE s.service_time END)) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Equipment collection must be after that sitting starts.';
    END IF;
    FOREACH leg IN ARRAY ARRAY['delivery','collection'] LOOP
      ids := coalesce(op->CASE WHEN leg='delivery' THEN 'deliveryDriverIds' ELSE 'collectionDriverIds' END,'[]'::jsonb);
      IF leg='collection' AND NOT req THEN ids:='[]'::jsonb; END IF;
      IF jsonb_typeof(ids) IS DISTINCT FROM 'array' OR jsonb_array_length(ids)>12 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose valid drivers for each trip.'; END IF;
      at_time := CASE WHEN leg='delivery' THEN (o.event_date::date+nullif(op->>'dispatchTime','')::time) AT TIME ZONE zone
        WHEN req THEN ((op->>'returnDate')::date+(op->>'returnTime')::time) AT TIME ZONE zone ELSE NULL END;
      IF jsonb_array_length(ids)>0 AND at_time IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Set the trip time before assigning its drivers.'; END IF;
      IF EXISTS(SELECT 1 FROM public.driver_assignments a WHERE a.service_sitting_id=s.id AND a.assignment_type=leg
        AND a.status::text NOT IN ('assigned','accepted','cancelled','rejected')
        AND (NOT ids ? a.driver_id::text OR a.scheduled_for IS DISTINCT FROM at_time)) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A trip has already started. Keep its driver and time, or contact dispatch.';
      END IF;
      UPDATE public.driver_assignments SET status='cancelled',rejection_reason='Sitting trip reassigned by dispatch'
        WHERE service_sitting_id=s.id AND assignment_type=leg AND status::text IN ('assigned','accepted') AND NOT ids ? driver_id::text;
      FOR driver IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(ids) LOOP
        IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=driver AND company_id=o.company_id AND role::text='driver' AND is_active IS DISTINCT FROM false) THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose an active driver from this company.';
        END IF;
        -- Include other sitting trips as well as the legacy dispatch roster.
        IF EXISTS(SELECT 1 FROM public.driver_assignments a WHERE a.driver_id=driver AND a.company_id=o.company_id
          AND a.status::text NOT IN ('cancelled','rejected','completed') AND a.scheduled_for BETWEEN at_time-interval '45 minutes' AND at_time+interval '45 minutes'
          AND (a.service_sitting_id IS DISTINCT FROM s.id OR a.assignment_type IS DISTINCT FROM leg)) THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This driver has another trip within 45 minutes. Choose another driver or time.';
        END IF;
        IF EXISTS(SELECT 1 FROM public.orders other WHERE other.company_id=o.company_id AND other.id<>o.id AND other.deleted_at IS NULL
          AND other.status::text NOT IN ('cancelled','completed','delivered','postponed') AND other.event_date=(at_time AT TIME ZONE zone)::date
          AND (other.assigned_driver_id=driver OR other.secondary_driver_id=driver)
          AND abs(extract(epoch FROM (other.event_time::time-(at_time AT TIME ZONE zone)::time)))<2700) THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This driver has an overlapping booking. Choose another driver or time.';
        END IF;
        INSERT INTO public.driver_assignments(company_id,order_id,service_sitting_id,driver_id,assignment_type,status,scheduled_for,notes)
          VALUES(o.company_id,o.id,s.id,driver,leg,'assigned',at_time,'Sitting '||s.sequence_number||' - '||s.guest_count||' guests at '||to_char(s.service_time,'HH24:MI'))
          ON CONFLICT(order_id,service_sitting_id,driver_id,assignment_type) DO UPDATE SET scheduled_for=excluded.scheduled_for,
            status=CASE WHEN driver_assignments.status::text IN ('cancelled','rejected') THEN 'assigned'::public.assignment_status ELSE driver_assignments.status END;
      END LOOP;
    END LOOP;
    UPDATE public.service_sittings SET kitchen_ready_time=nullif(op->>'kitchenReadyTime','')::time,
      dispatch_time=nullif(op->>'dispatchTime','')::time,packing_notes=left(op->>'packingNotes',2000),
      cleaning_reset_required=coalesce((op->>'cleaningResetRequired')::boolean,false),
      return_required=req,return_date=CASE WHEN req THEN (op->>'returnDate')::date ELSE NULL END,
      return_time=CASE WHEN req THEN (op->>'returnTime')::time ELSE NULL END WHERE id=s.id;
  END LOOP;
  UPDATE public.driver_assignments SET status='cancelled',rejection_reason='Replaced by the sitting trip schedule'
    WHERE order_id=o.id AND service_sitting_id IS NULL AND assignment_type IN ('delivery','collection') AND status::text IN ('assigned','accepted');
  UPDATE public.orders SET equipment_return_plan=p_return_plan,equipment_return_method=CASE WHEN p_return_plan='on_site_return' THEN 'waiter' WHEN p_return_plan='client_return' THEN 'none' WHEN (SELECT min(return_date)>o.event_date::date FROM public.service_sittings WHERE order_id=o.id AND return_required) THEN 'driver_next_day' ELSE 'driver_same_day' END,collection_next_day=coalesce((SELECT min(return_date)>o.event_date::date FROM public.service_sittings WHERE order_id=o.id AND return_required),false),assigned_driver_id=NULL,driver_id=NULL,secondary_driver_id=NULL,updated_at=now() WHERE id=o.id;
END; $$;
REVOKE ALL ON FUNCTION public.save_order_sitting_operations(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_sitting_operations(uuid,uuid,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.advance_sitting_driver_trip(p_assignment_id uuid,p_driver_id uuid,p_company_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.driver_assignments%ROWTYPE; stages text[]; old_pos integer; new_pos integer;
BEGIN
  SELECT * INTO a FROM public.driver_assignments WHERE id=p_assignment_id AND driver_id=p_driver_id AND company_id=p_company_id AND service_sitting_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This trip is not assigned to you.'; END IF;
  PERFORM 1 FROM public.orders WHERE id=a.order_id AND deleted_at IS NULL AND status::text NOT IN ('cancelled','postponed','completed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This booking is no longer active.'; END IF;
  stages:=CASE WHEN a.assignment_type='collection' THEN ARRAY['assigned','accepted','en_route','picked_up','completed'] ELSE ARRAY['assigned','accepted','en_route','at_venue','delivered','completed'] END;
  old_pos:=array_position(stages,a.status::text); new_pos:=array_position(stages,p_status);
  IF new_pos IS NULL OR old_pos IS NULL OR new_pos NOT IN (old_pos,old_pos+1) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Complete the current trip stage first.'; END IF;
  IF old_pos=new_pos THEN RETURN; END IF;
  UPDATE public.driver_assignments SET status=p_status::public.assignment_status,
    accepted_at=CASE WHEN p_status='accepted' THEN now() ELSE accepted_at END,
    en_route_at=CASE WHEN p_status='en_route' THEN now() ELSE en_route_at END,
    arrived_at_venue_at=CASE WHEN p_status='at_venue' THEN now() ELSE arrived_at_venue_at END,
    picked_up_at=CASE WHEN p_status='picked_up' THEN now() ELSE picked_up_at END,
    delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE delivered_at END,
    completed_at=CASE WHEN p_status='completed' THEN now() ELSE completed_at END WHERE id=a.id;
  IF a.assignment_type='delivery' AND p_status IN ('delivered','completed') AND NOT EXISTS(
    SELECT 1 FROM public.driver_assignments WHERE service_sitting_id=a.service_sitting_id AND assignment_type='delivery' AND status::text NOT IN ('delivered','completed','cancelled','rejected')) THEN
    UPDATE public.service_sittings SET status='served' WHERE id=a.service_sitting_id;
  END IF;
  IF a.assignment_type='delivery' AND p_status IN ('delivered','completed') AND NOT EXISTS(
    SELECT 1 FROM public.service_sittings WHERE order_id=a.order_id AND status NOT IN ('served','cancelled')) THEN
    PERFORM set_config('app.sitting_trip_update','on',true);
    UPDATE public.orders SET status='delivered',delivered_at=coalesce(delivered_at,now()) WHERE id=a.order_id AND status::text NOT IN ('completed','cancelled');
    PERFORM set_config('app.sitting_trip_update','off',true);
  END IF;

END; $$;
REVOKE ALL ON FUNCTION public.advance_sitting_driver_trip(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_sitting_driver_trip(uuid,uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.apply_addressed_quote_service_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan jsonb := coalesce(NEW.reviewed_service_sittings,NEW.requested_changes->'service_sittings');
  v_quote public.quotes%ROWTYPE;
  v_sitting jsonb;
  v_guests numeric;
  v_total numeric := 0;
  v_sequence integer := 0;
BEGIN
  IF v_plan IS NULL OR v_plan = 'null'::jsonb THEN RETURN NEW; END IF;
  -- Save & Send may address several requests together. Only the newest
  -- serving proposal wins, regardless of the trigger execution order.
  IF EXISTS (
    SELECT 1 FROM public.quote_change_requests r
    WHERE r.quote_id = NEW.quote_id AND r.company_id = NEW.company_id
      AND r.status <> 'dismissed'
      AND r.requested_changes->'service_sittings' IS NOT NULL
      AND r.requested_changes->'service_sittings' <> 'null'::jsonb
      AND (r.created_at, r.id) > (NEW.created_at, NEW.id)
  ) THEN RETURN NEW; END IF;
  SELECT * INTO v_quote FROM public.quotes
    WHERE id = NEW.quote_id AND company_id = NEW.company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quote not found for this serving plan.'; END IF;
  IF v_quote.converted_to_order_id IS NOT NULL OR v_quote.status = 'accepted' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Please change serving times from the existing booking.';
  END IF;
  IF jsonb_typeof(v_plan) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid serving plan.';
  END IF;
  IF jsonb_array_length(v_plan) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose between one and twelve service sittings.';
  END IF;
  FOR v_sitting IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
    IF jsonb_typeof(v_sitting->'guestCount') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Every sitting needs a valid guest count.';
    END IF;
    v_guests := (v_sitting->>'guestCount')::numeric;
    IF v_guests < 1 OR v_guests > 2147483647 OR v_guests <> trunc(v_guests) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Every sitting needs a valid guest count.';
    END IF;
    v_total := v_total + v_guests;
    IF coalesce(v_sitting->>'serviceTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Every sitting needs a valid service time.';
    END IF;
  END LOOP;
  IF v_total IS DISTINCT FROM v_quote.guest_count::numeric THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Serving-plan guests must match the revised quote. Update the plan before addressing this request.';
  END IF;
  DELETE FROM public.service_sittings WHERE quote_id = v_quote.id AND order_id IS NULL;
  FOR v_sitting IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
    v_sequence := v_sequence + 1;
    INSERT INTO public.service_sittings(company_id,quote_id,sequence_number,guest_count,service_time)
      VALUES(v_quote.company_id,v_quote.id,v_sequence,(v_sitting->>'guestCount')::integer,(v_sitting->>'serviceTime')::time);
  END LOOP;
  UPDATE public.quotes SET event_time = (v_plan->0->>'serviceTime')::time, updated_at = now() WHERE id = v_quote.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_addressed_quote_service_plan() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS quote_change_request_apply_service_plan ON public.quote_change_requests;
CREATE TRIGGER quote_change_request_apply_service_plan
  AFTER UPDATE OF status ON public.quote_change_requests
  FOR EACH ROW WHEN (NEW.status = 'addressed' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.apply_addressed_quote_service_plan();


CREATE OR REPLACE FUNCTION public.promote_order_service_sittings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.quote_id IS NOT NULL THEN
    UPDATE public.service_sittings SET order_id=NEW.id WHERE quote_id=NEW.quote_id AND company_id=NEW.company_id AND order_id IS NULL;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.promote_order_service_sittings() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS promote_order_service_sittings ON public.orders;
CREATE TRIGGER promote_order_service_sittings AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.promote_order_service_sittings();

DROP POLICY IF EXISTS driver_read_sitting_bookings ON public.orders;
CREATE POLICY driver_read_sitting_bookings ON public.orders FOR SELECT TO authenticated USING (
  company_id=public.get_user_company_id(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.driver_assignments a WHERE a.order_id=orders.id AND a.company_id=orders.company_id AND a.driver_id=auth.uid()
      AND a.service_sitting_id IS NOT NULL AND a.status::text NOT IN ('cancelled','rejected')
  )
);

CREATE OR REPLACE FUNCTION public.guard_sitting_order_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('in_transit','delivered','completed')
    AND coalesce(current_setting('app.sitting_trip_update',true),'')<>'on'
    AND (SELECT count(*) FROM public.service_sittings WHERE order_id=NEW.id)>1 THEN
    IF NEW.status::text='in_transit' OR EXISTS(SELECT 1 FROM public.service_sittings WHERE order_id=NEW.id AND status NOT IN ('served','cancelled')) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Update each sitting trip separately; other sittings are still open.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_sitting_order_progress() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_sitting_order_progress ON public.orders;
CREATE TRIGGER guard_sitting_order_progress BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_sitting_order_progress();
CREATE OR REPLACE FUNCTION public.stamp_order_event_end_from_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ts timestamptz;
BEGIN
  IF NEW.order_id IS NULL
     OR NEW.assignment_type IS DISTINCT FROM 'collection'
     OR NEW.status::text NOT IN ('picked_up', 'completed')
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF (NEW.service_sitting_id IS NOT NULL OR (SELECT count(*) FROM public.service_sittings WHERE order_id=NEW.order_id)>1) AND (
    EXISTS(SELECT 1 FROM public.service_sittings s WHERE s.order_id=NEW.order_id AND s.status NOT IN ('served','cancelled'))
    OR EXISTS(SELECT 1 FROM public.service_sittings s WHERE s.order_id=NEW.order_id AND s.return_required AND s.status<>'cancelled' AND (
      NOT EXISTS(SELECT 1 FROM public.driver_assignments a WHERE a.service_sitting_id=s.id AND a.assignment_type='collection' AND a.status::text NOT IN ('cancelled','rejected'))
      OR EXISTS(SELECT 1 FROM public.driver_assignments a WHERE a.service_sitting_id=s.id AND a.assignment_type='collection' AND a.status::text NOT IN ('picked_up','completed','cancelled','rejected'))
    ))
  ) THEN RETURN NEW; END IF;
  ts := COALESCE(NEW.picked_up_at, NEW.completed_at, now());
  -- The collection may be run by a driver other than the order's assigned
  -- driver; the trusted-stamp path in the orders whitelist
  -- (20261007115900) lets these two stamps through for them.
  PERFORM set_config('app.trusted_order_stamp', 'on', true);
  UPDATE public.orders
     SET service_ended_at  = COALESCE(service_ended_at,  ts),
         event_complete_at = COALESCE(event_complete_at, ts)
   WHERE id = NEW.order_id
     AND (service_ended_at IS NULL OR event_complete_at IS NULL);
  PERFORM set_config('app.trusted_order_stamp', 'off', true);
  RETURN NEW;
END $function$;



CREATE OR REPLACE FUNCTION public.guard_legacy_sitting_trip_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.service_sitting_id IS NULL AND NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status::text NOT IN ('assigned','cancelled','rejected')
    AND (SELECT count(*) FROM public.service_sittings WHERE order_id=NEW.order_id)>1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This booking has separate sitting trips. Open your sitting deliveries and collections to update the correct trip.';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_legacy_sitting_trip_progress() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_legacy_sitting_trip_progress ON public.driver_assignments;
CREATE TRIGGER guard_legacy_sitting_trip_progress BEFORE UPDATE OF status ON public.driver_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_sitting_trip_progress();

COMMIT;
