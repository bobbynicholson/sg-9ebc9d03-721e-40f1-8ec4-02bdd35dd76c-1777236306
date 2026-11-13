BEGIN;

-- The old guard rejected every schedule edit once kitchen work or a trip had
-- started. Admins may now confirm a revised plan. Existing started kitchen
-- batches remain immutable; pending batches are regenerated from the new plan.
DROP FUNCTION IF EXISTS public.save_admin_order_service_plan_with_venues(uuid,uuid,jsonb,text,jsonb);
DROP FUNCTION IF EXISTS public.save_admin_order_service_plan(uuid,uuid,jsonb,text,jsonb);

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
      IF EXISTS(SELECT 1 FROM public.driver_assignments a WHERE a.service_sitting_id=s.id AND a.company_id=o.company_id
        AND a.status::text NOT IN ('assigned','accepted','cancelled','rejected')) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This sitting has a driver trip underway. Keep its delivery address unchanged until the trip is complete.';
      END IF;
      location_changed := true;
    END IF;
    UPDATE public.service_sittings SET venue_name=venue_name_value,venue_address=venue_address_value,venue_lat=lat_value,venue_lng=lng_value WHERE id=s.id;
  END LOOP;
  RETURN location_changed;
END; $$;

CREATE OR REPLACE FUNCTION public.save_admin_order_service_plan(
  p_order_id uuid, p_company_id uuid, p_operations jsonb, p_return_plan text,
  p_kitchen_tasks jsonb DEFAULT '[]', p_confirm_active_work boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  o public.orders%ROWTYPE; s public.service_sittings%ROWTYPE; op jsonb; task jsonb;
  seq integer:=0; existing_count integer; guests numeric; total numeric:=0;
  changed boolean:=false; active_work boolean:=false; schedule jsonb:='[]';
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND company_id=p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR o.status::text IN ('draft','cancelled','completed','postponed') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Only an active booked order can be split into sittings.';
  END IF;
  IF jsonb_typeof(p_operations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_operations) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose between one and twelve service sittings.';
  END IF;
  SELECT count(*) INTO existing_count FROM public.service_sittings WHERE order_id=o.id AND company_id=o.company_id;
  IF jsonb_array_length(p_operations)<existing_count THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Saved sittings cannot be removed here. Keep their guest allocation or contact dispatch.';
  END IF;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_operations))<>jsonb_array_length(p_operations) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Every sitting must have its own identifier.';
  END IF;
  changed:=existing_count<>jsonb_array_length(p_operations) OR (jsonb_array_length(p_operations)>1 AND EXISTS(SELECT 1 FROM public.kitchen_prep_tasks WHERE order_id=o.id AND company_id=o.company_id AND deleted_at IS NULL AND service_sitting_id IS NULL));
  PERFORM 1 FROM public.kitchen_prep_tasks WHERE order_id=o.id AND company_id=o.company_id AND deleted_at IS NULL FOR UPDATE;
  FOR op IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
    seq:=seq+1;
    IF jsonb_typeof(op->'guest_count') IS DISTINCT FROM 'number' OR coalesce(op->>'service_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Each sitting needs a whole guest count and valid service time.';
    END IF;
    guests:=(op->>'guest_count')::numeric;
    IF guests<1 OR guests>2147483647 OR guests<>trunc(guests) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Every sitting needs a positive whole guest count.';
    END IF;
    total:=total+guests;
    SELECT * INTO s FROM public.service_sittings WHERE order_id=o.id AND company_id=o.company_id AND sequence_number=seq FOR UPDATE;
    IF FOUND THEN
      IF s.id IS DISTINCT FROM (op->>'id')::uuid OR (op->>'updated_at' IS NOT NULL AND (op->>'updated_at')::timestamptz IS DISTINCT FROM s.updated_at) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Another team member changed this plan. Reload the saved schedule before editing.';
      END IF;
      changed:=changed OR s.guest_count<>guests OR s.service_time<>(op->>'service_time')::time
        OR s.kitchen_ready_time IS DISTINCT FROM nullif(op->>'kitchenReadyTime','')::time
        OR s.dispatch_time IS DISTINCT FROM nullif(op->>'dispatchTime','')::time
        OR ((op ? 'venueName' OR op ? 'venue_name') AND coalesce(s.venue_name,o.venue_name) IS DISTINCT FROM coalesce(nullif(btrim(coalesce(op->>'venueName',op->>'venue_name')),''),o.venue_name))
        OR ((op ? 'venueAddress' OR op ? 'venue_address') AND coalesce(s.venue_address,o.venue_address) IS DISTINCT FROM coalesce(nullif(btrim(coalesce(op->>'venueAddress',op->>'venue_address')),''),o.venue_address))
        OR ((op ? 'venueLat' OR op ? 'venue_lat') AND coalesce(s.venue_lat,o.venue_lat) IS DISTINCT FROM coalesce(nullif(coalesce(op->>'venueLat',op->>'venue_lat'),'')::double precision,o.venue_lat))
        OR ((op ? 'venueLng' OR op ? 'venue_lng') AND coalesce(s.venue_lng,o.venue_lng) IS DISTINCT FROM coalesce(nullif(coalesce(op->>'venueLng',op->>'venue_lng'),'')::double precision,o.venue_lng));
    ELSIF EXISTS(SELECT 1 FROM public.service_sittings WHERE id=(op->>'id')::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting does not belong to this booking.';
    END IF;
    schedule:=schedule||jsonb_build_array(op-'updated_at');
  END LOOP;
  IF total IS DISTINCT FROM o.guest_count::numeric THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Sitting guest counts must match the booking total. This split does not change the invoice.';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.kitchen_prep_tasks WHERE order_id=o.id AND company_id=o.company_id AND deleted_at IS NULL AND (status<>'pending' OR started_at IS NOT NULL)
    UNION ALL SELECT 1 FROM public.service_sittings WHERE order_id=o.id AND company_id=o.company_id AND status<>'planned'
    UNION ALL SELECT 1 FROM public.driver_assignments WHERE order_id=o.id AND status::text NOT IN ('assigned','accepted','cancelled','rejected')
  ) INTO active_work;
  IF changed AND active_work AND NOT coalesce(p_confirm_active_work,false) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ACTIVE_ORDER_WORK_CONFIRMATION_REQUIRED:Kitchen or delivery work has started. Confirm to save the revised guest split and schedule. Started or completed kitchen batches keep their original quantities; pending batches are recalculated. A driver trip already underway must keep its current driver, time, and delivery address.';
  END IF;
  IF jsonb_typeof(p_kitchen_tasks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_kitchen_tasks)>10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='The kitchen plan could not be validated. Please retry.';
  END IF;

  UPDATE public.orders SET event_time=(p_operations->0->>'service_time')::time,updated_at=now() WHERE id=o.id;
  seq:=0;
  FOR op IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
    seq:=seq+1;
    INSERT INTO public.service_sittings(id,company_id,order_id,quote_id,sequence_number,guest_count,service_time)
      VALUES((op->>'id')::uuid,o.company_id,o.id,o.quote_id,seq,(op->>'guest_count')::integer,(op->>'service_time')::time)
      ON CONFLICT(id) DO UPDATE SET guest_count=excluded.guest_count,service_time=excluded.service_time;
  END LOOP;
  PERFORM public.save_order_sitting_operations(o.id,o.company_id,schedule,p_return_plan);
  UPDATE public.quotes SET event_time=(p_operations->0->>'service_time')::time,updated_at=now()
    WHERE id=o.quote_id AND company_id=o.company_id;

  IF changed THEN
    UPDATE public.kitchen_prep_tasks SET deleted_at=now()
      WHERE order_id=o.id AND company_id=o.company_id AND deleted_at IS NULL AND status='pending' AND started_at IS NULL;
    FOR task IN SELECT value FROM jsonb_array_elements(p_kitchen_tasks) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.service_sittings WHERE id=(task->>'service_sitting_id')::uuid AND order_id=o.id AND company_id=o.company_id) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A kitchen batch does not belong to this booking.';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.kitchen_prep_tasks k WHERE k.order_id=o.id AND k.company_id=o.company_id
        AND k.service_sitting_id=(task->>'service_sitting_id')::uuid AND lower(btrim(k.menu_item_name))=lower(btrim(left(task->>'menu_item_name',200)))
        AND k.task_type=task->>'task_type' AND k.deleted_at IS NULL AND (k.status<>'pending' OR k.started_at IS NOT NULL)) THEN
        INSERT INTO public.kitchen_prep_tasks(company_id,order_id,region_id,service_sitting_id,menu_item_name,task_type,start_at,duration_min,status,notes,planned_yield,yield_unit)
          VALUES(o.company_id,o.id,o.region_id,(task->>'service_sitting_id')::uuid,left(task->>'menu_item_name',200),task->>'task_type',
            (task->>'start_at')::timestamptz,(task->>'duration_min')::integer,'pending',left(task->>'notes',2000),
            nullif(task->>'planned_yield','')::numeric,task->>'yield_unit');
      END IF;
    END LOOP;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.save_admin_order_service_plan(uuid,uuid,jsonb,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_order_service_plan(uuid,uuid,jsonb,text,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.save_admin_order_service_plan_with_venues(
  p_order_id uuid, p_company_id uuid, p_operations jsonb, p_return_plan text,
  p_kitchen_tasks jsonb DEFAULT '[]', p_confirm_active_work boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  location_changed boolean;
  task jsonb;
BEGIN
  PERFORM public.save_admin_order_service_plan(p_order_id,p_company_id,p_operations,p_return_plan,p_kitchen_tasks,p_confirm_active_work);
  location_changed := public.apply_order_sitting_venues(p_order_id,p_company_id,p_operations);
  IF location_changed THEN
    UPDATE public.kitchen_prep_tasks SET deleted_at=now()
      WHERE order_id=p_order_id AND company_id=p_company_id AND deleted_at IS NULL AND status='pending' AND started_at IS NULL;
    IF jsonb_typeof(p_kitchen_tasks) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='The kitchen plan could not be validated. Please retry.'; END IF;
    FOR task IN SELECT value FROM jsonb_array_elements(p_kitchen_tasks) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.service_sittings WHERE id=(task->>'service_sitting_id')::uuid AND order_id=p_order_id AND company_id=p_company_id) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A kitchen batch does not belong to this booking.';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.kitchen_prep_tasks k WHERE k.order_id=p_order_id AND k.company_id=p_company_id
        AND k.service_sitting_id=(task->>'service_sitting_id')::uuid AND lower(btrim(k.menu_item_name))=lower(btrim(left(task->>'menu_item_name',200)))
        AND k.task_type=task->>'task_type' AND k.deleted_at IS NULL AND (k.status<>'pending' OR k.started_at IS NOT NULL)) THEN
        INSERT INTO public.kitchen_prep_tasks(company_id,order_id,region_id,service_sitting_id,menu_item_name,task_type,start_at,duration_min,status,notes,planned_yield,yield_unit)
          SELECT p_company_id,p_order_id,o.region_id,(task->>'service_sitting_id')::uuid,left(task->>'menu_item_name',200),task->>'task_type',
            (task->>'start_at')::timestamptz,(task->>'duration_min')::integer,'pending',left(task->>'notes',2000),
            nullif(task->>'planned_yield','')::numeric,task->>'yield_unit'
          FROM public.orders o WHERE o.id=p_order_id AND o.company_id=p_company_id;
      END IF;
    END LOOP;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.save_admin_order_service_plan_with_venues(uuid,uuid,jsonb,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_order_service_plan_with_venues(uuid,uuid,jsonb,text,jsonb,boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
