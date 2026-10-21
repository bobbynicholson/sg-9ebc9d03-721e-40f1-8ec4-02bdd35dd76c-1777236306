-- A serving plan is a proposal until the caterer addresses the request.
-- Apply it in the same transaction as approval, covering every admin
-- editor/send path without letting a public request alter an agreed plan.
BEGIN;
CREATE OR REPLACE FUNCTION public.apply_addressed_quote_service_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan jsonb := NEW.requested_changes->'service_sittings';
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
COMMIT;
