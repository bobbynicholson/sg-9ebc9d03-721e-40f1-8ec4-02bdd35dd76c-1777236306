  BEGIN;

  -- A driver may intentionally be assigned to several stops in one shared run.
  -- Keep the 45-minute overlap check, but let an administrator repeat the save
  -- with allowDriverOverlap after the UI has asked them to confirm the route.
  CREATE OR REPLACE FUNCTION public.save_order_sitting_operations(
    p_order_id uuid, p_company_id uuid, p_operations jsonb, p_return_plan text
  ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DECLARE
    o public.orders%ROWTYPE; s public.service_sittings%ROWTYPE; op jsonb;
    leg text; ids jsonb; driver uuid; driver_name text; at_time timestamptz; zone text;
    expected integer; actual integer; t text; req boolean; last_seq integer;
    allow_driver_overlap boolean := coalesce((p_operations->0->>'allowDriverOverlap')::boolean,false);
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
          IF NOT allow_driver_overlap THEN
            -- Existing sitting trips include other rows added earlier in this
            -- same transaction, so dispatch is asked before any assignment is
            -- committed if a driver is being booked for multiple nearby stops.
            SELECT p.full_name INTO driver_name
            FROM public.driver_assignments a
            LEFT JOIN public.profiles p ON p.id=a.driver_id
            WHERE a.driver_id=driver AND a.company_id=o.company_id
              AND a.status::text NOT IN ('cancelled','rejected','completed')
              AND a.scheduled_for BETWEEN at_time-interval '45 minutes' AND at_time+interval '45 minutes'
              AND (a.service_sitting_id IS DISTINCT FROM s.id OR a.assignment_type IS DISTINCT FROM leg)
            LIMIT 1;
            IF FOUND THEN
              RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='DISPATCH_OVERLAP_CONFIRMATION_REQUIRED: '||coalesce(driver_name,'A selected driver')||' already has another trip within 45 minutes.';
            END IF;
            -- Also retain protection for legacy whole-order driver assignments.
            SELECT p.full_name INTO driver_name
            FROM public.orders other
            LEFT JOIN public.profiles p ON p.id=driver
            WHERE other.company_id=o.company_id AND other.id<>o.id AND other.deleted_at IS NULL
              AND other.status::text NOT IN ('cancelled','completed','delivered','postponed')
              AND other.event_date=(at_time AT TIME ZONE zone)::date
              AND (other.assigned_driver_id=driver OR other.secondary_driver_id=driver)
              AND abs(extract(epoch FROM (other.event_time::time-(at_time AT TIME ZONE zone)::time)))<2700
            LIMIT 1;
            IF FOUND THEN
              RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='DISPATCH_OVERLAP_CONFIRMATION_REQUIRED: '||coalesce(driver_name,'A selected driver')||' has another booking within 45 minutes.';
            END IF;
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

  NOTIFY pgrst, 'reload schema';
  COMMIT;
