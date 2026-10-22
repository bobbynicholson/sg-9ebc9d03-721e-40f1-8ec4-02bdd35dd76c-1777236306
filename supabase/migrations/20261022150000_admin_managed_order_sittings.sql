BEGIN;

-- Scheduling writes go through authenticated admin endpoints. A customer
-- session must not bypass those endpoints with a direct table update.
DROP POLICY IF EXISTS "company members manage service sittings" ON public.service_sittings;
DROP POLICY IF EXISTS "company members read service sittings" ON public.service_sittings;
CREATE POLICY "company members read service sittings" ON public.service_sittings
  FOR SELECT USING(company_id=public.get_user_company_id(auth.uid()));

-- Staff can split an existing booking without creating another order,
-- client invoice, payment or ingredient-demand source.
CREATE OR REPLACE FUNCTION public.save_admin_order_service_plan(
  p_order_id uuid, p_company_id uuid, p_operations jsonb, p_return_plan text,
  p_kitchen_tasks jsonb DEFAULT '[]'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  o public.orders%ROWTYPE; s public.service_sittings%ROWTYPE; op jsonb; task jsonb;
  seq integer:=0; existing_count integer; guests numeric; total numeric:=0;
  changed boolean:=false; schedule jsonb:='[]';
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
        OR s.dispatch_time IS DISTINCT FROM nullif(op->>'dispatchTime','')::time;
    ELSIF EXISTS(SELECT 1 FROM public.service_sittings WHERE id=(op->>'id')::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A sitting does not belong to this booking.';
    END IF;
    schedule:=schedule||jsonb_build_array(op-'updated_at');
  END LOOP;
  IF total IS DISTINCT FROM o.guest_count::numeric THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Sitting guest counts must match the booking total. This split does not change the invoice.';
  END IF;
  IF changed AND (
    EXISTS(SELECT 1 FROM public.kitchen_prep_tasks WHERE order_id=o.id AND company_id=o.company_id AND deleted_at IS NULL AND (status<>'pending' OR started_at IS NOT NULL))
    OR EXISTS(SELECT 1 FROM public.service_sittings WHERE order_id=o.id AND status<>'planned')
    OR EXISTS(SELECT 1 FROM public.driver_assignments WHERE order_id=o.id AND status::text NOT IN ('assigned','accepted','cancelled','rejected'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Kitchen work or a trip has already started. Contact the team before changing the guest split or service times.';
  END IF;
  IF jsonb_typeof(p_kitchen_tasks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_kitchen_tasks)>10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='The kitchen plan could not be validated. Please retry.';
  END IF;

  -- Updating the commercial anchor first lets the existing datetime cascade
  -- move pending ancillary work, before the exact sitting tasks are saved.
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
    UPDATE public.kitchen_prep_tasks SET deleted_at=now() WHERE order_id=o.id AND company_id=o.company_id AND deleted_at IS NULL AND status='pending';
    FOR task IN SELECT value FROM jsonb_array_elements(p_kitchen_tasks) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.service_sittings WHERE id=(task->>'service_sitting_id')::uuid AND order_id=o.id AND company_id=o.company_id) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A kitchen batch does not belong to this booking.';
      END IF;
      INSERT INTO public.kitchen_prep_tasks(company_id,order_id,region_id,service_sitting_id,menu_item_name,task_type,start_at,duration_min,status,notes,planned_yield,yield_unit)
        VALUES(o.company_id,o.id,o.region_id,(task->>'service_sitting_id')::uuid,left(task->>'menu_item_name',200),task->>'task_type',
          (task->>'start_at')::timestamptz,(task->>'duration_min')::integer,'pending',left(task->>'notes',2000),
          nullif(task->>'planned_yield','')::numeric,task->>'yield_unit');
    END LOOP;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.save_admin_order_service_plan(uuid,uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_order_service_plan(uuid,uuid,jsonb,text,jsonb) TO service_role;

-- Customer notes only change a plan after an administrator saves a reviewed plan.
CREATE OR REPLACE FUNCTION public.apply_addressed_quote_service_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan jsonb := NEW.reviewed_service_sittings;
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
      AND r.reviewed_service_sittings IS NOT NULL
      AND r.reviewed_service_sittings <> 'null'::jsonb
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

-- Completing one kitchen batch never completes the other sitting.
CREATE OR REPLACE FUNCTION public.mark_sitting_kitchen_ready()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.service_sitting_id IS NOT NULL AND NEW.deleted_at IS NULL AND NEW.status IN ('done','skipped')
    AND NOT EXISTS(SELECT 1 FROM public.kitchen_prep_tasks WHERE service_sitting_id=NEW.service_sitting_id
      AND company_id=NEW.company_id AND deleted_at IS NULL AND status NOT IN ('done','skipped')) THEN
    UPDATE public.service_sittings SET status='ready' WHERE id=NEW.service_sitting_id AND company_id=NEW.company_id AND status='planned';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.mark_sitting_kitchen_ready() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sitting_kitchen_ready ON public.kitchen_prep_tasks;
CREATE TRIGGER sitting_kitchen_ready AFTER UPDATE OF status ON public.kitchen_prep_tasks
  FOR EACH ROW EXECUTE FUNCTION public.mark_sitting_kitchen_ready();
COMMIT;
