BEGIN;

-- A quote-only sitting has no order yet. NULL order IDs must not collide
-- across unrelated quotes (and vice versa for order-only sittings).
ALTER TABLE public.service_sittings
  DROP CONSTRAINT IF EXISTS service_sittings_quote_sequence_unique,
  DROP CONSTRAINT IF EXISTS service_sittings_order_sequence_unique,
  ADD CONSTRAINT service_sittings_quote_sequence_unique UNIQUE (quote_id, sequence_number),
  ADD CONSTRAINT service_sittings_order_sequence_unique UNIQUE (order_id, sequence_number);

-- Status and the client's serving plan commit together. A failed plan write
-- must leave the quote available to accept, rather than create false success.
CREATE OR REPLACE FUNCTION public.accept_quote_service_plan(
  p_quote_id uuid,
  p_company_id uuid,
  p_service_sittings jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_already_accepted boolean;
  v_sitting jsonb;
  v_guests numeric;
  v_total numeric := 0;
  v_sequence integer := 0;
  v_time_key text;
BEGIN
  SELECT * INTO v_quote FROM public.quotes
    WHERE id = p_quote_id AND company_id = p_company_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_already_accepted := coalesce(v_quote.status = 'accepted', false) OR v_quote.converted_to_order_id IS NOT NULL;
  IF NOT v_already_accepted THEN
    IF v_quote.status IS NULL OR v_quote.status NOT IN ('draft', 'sent')
      OR v_quote.event_date::date < (now() AT TIME ZONE 'UTC')::date
      OR v_quote.valid_until::timestamptz < now() THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This quote is no longer available to accept.';
    END IF;
  END IF;

  -- A retry may fill a missing plan left by the earlier non-atomic endpoint.
  -- It cannot replace a plan that has already been accepted or scheduled.
  IF p_service_sittings IS NOT NULL AND (
    NOT v_already_accepted OR NOT EXISTS (
      SELECT 1 FROM public.service_sittings WHERE quote_id = v_quote.id
    )
  ) THEN
    IF jsonb_typeof(p_service_sittings) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid serving plan.';
    END IF;
    IF jsonb_array_length(p_service_sittings) NOT BETWEEN 1 AND 12 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose between one and twelve service sittings.';
    END IF;
    FOR v_sitting IN SELECT value FROM jsonb_array_elements(p_service_sittings) LOOP
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
      FOREACH v_time_key IN ARRAY ARRAY['kitchenReadyTime', 'dispatchTime', 'returnTime'] LOOP
        IF coalesce(v_sitting->>v_time_key, '') <> '' AND
          (v_sitting->>v_time_key) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Use a valid time for each operational deadline.';
        END IF;
      END LOOP;
    END LOOP;
    IF v_total <> v_quote.guest_count THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Sitting guest counts must match the quote guest count.';
    END IF;

    DELETE FROM public.service_sittings WHERE quote_id = v_quote.id AND order_id IS NULL;
    FOR v_sitting IN SELECT value FROM jsonb_array_elements(p_service_sittings) LOOP
      v_sequence := v_sequence + 1;
      INSERT INTO public.service_sittings (
        company_id, quote_id, order_id, sequence_number, guest_count, service_time,
        kitchen_ready_time, dispatch_time, cleaning_reset_required, return_required, return_time
      ) VALUES (
        v_quote.company_id, v_quote.id, v_quote.converted_to_order_id, v_sequence,
        (v_sitting->>'guestCount')::integer, (v_sitting->>'serviceTime')::time,
        nullif(v_sitting->>'kitchenReadyTime', '')::time, nullif(v_sitting->>'dispatchTime', '')::time,
        coalesce((v_sitting->>'cleaningResetRequired')::boolean, false),
        coalesce((v_sitting->>'returnRequired')::boolean, false), nullif(v_sitting->>'returnTime', '')::time
      );
    END LOOP;
  END IF;

  IF NOT v_already_accepted THEN
    UPDATE public.quotes SET accepted_at = now(), status = 'accepted', lost_reason = NULL, rejected_at = NULL
      WHERE id = v_quote.id RETURNING * INTO v_quote;
  END IF;
  RETURN jsonb_build_object('quote', to_jsonb(v_quote), 'alreadyAccepted', v_already_accepted);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_quote_service_plan(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quote_service_plan(uuid, uuid, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
