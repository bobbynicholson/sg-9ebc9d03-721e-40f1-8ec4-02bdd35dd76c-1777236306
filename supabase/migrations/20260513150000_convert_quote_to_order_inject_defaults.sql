-- convert_quote_to_order was failing every accept-quote attempt with
-- a NOT NULL violation on orders.id, then on requires_refrigeration
-- and requires_two_drivers once id was injected. Root cause:
-- jsonb_populate_record does NOT honour column DEFAULTs -- it returns
-- a record where every column missing from the payload is NULL, which
-- the subsequent INSERT then writes through verbatim.
--
-- Fix: materialise the defaults for every NOT NULL column that has a
-- table-level default, inside the function, before the populate_record
-- call. Same pattern the function already used for order_number.

CREATE OR REPLACE FUNCTION public.convert_quote_to_order(
  p_quote_id        uuid,
  p_company_id      uuid,
  p_actor_user_id   uuid,
  p_order_payload   jsonb
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote        public.quotes%ROWTYPE;
  v_new_order    public.orders%ROWTYPE;
  v_payload      jsonb := COALESCE(p_order_payload, '{}'::jsonb);
  v_order_number text;
BEGIN
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found: % does not exist', p_quote_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'quote_company_mismatch: quote % belongs to a different tenant', p_quote_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_quote.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'quote_deleted: quote % is soft-deleted', p_quote_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_quote.converted_to_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'quote_already_converted: quote % is already linked to order %',
      p_quote_id, v_quote.converted_to_order_id
      USING ERRCODE = 'P0001';
  END IF;

  v_payload := v_payload
    || jsonb_build_object(
         'company_id', v_quote.company_id,
         'quote_id',   v_quote.id
       );

  -- Default-injection block. jsonb_populate_record DOES NOT honour
  -- column defaults, so every NOT NULL DEFAULT column we know about
  -- has to be materialised here when the caller omitted it.
  IF NOT (v_payload ? 'id') OR v_payload->>'id' IS NULL THEN
    v_payload := v_payload || jsonb_build_object('id', gen_random_uuid());
  END IF;
  IF NOT (v_payload ? 'created_at') OR v_payload->>'created_at' IS NULL THEN
    v_payload := v_payload || jsonb_build_object('created_at', now());
  END IF;
  IF NOT (v_payload ? 'updated_at') OR v_payload->>'updated_at' IS NULL THEN
    v_payload := v_payload || jsonb_build_object('updated_at', now());
  END IF;
  IF NOT (v_payload ? 'requires_refrigeration') OR v_payload->>'requires_refrigeration' IS NULL THEN
    v_payload := v_payload || jsonb_build_object('requires_refrigeration', false);
  END IF;
  IF NOT (v_payload ? 'requires_two_drivers') OR v_payload->>'requires_two_drivers' IS NULL THEN
    v_payload := v_payload || jsonb_build_object('requires_two_drivers', false);
  END IF;

  v_order_number := public.consume_next_document_number(v_quote.company_id, 'order');
  v_payload := v_payload || jsonb_build_object('order_number', v_order_number);

  IF NOT (v_payload ? 'status') OR v_payload->>'status' IS NULL THEN
    v_payload := v_payload || jsonb_build_object('status', 'confirmed');
  END IF;

  INSERT INTO public.orders
  SELECT (jsonb_populate_record(NULL::public.orders, v_payload)).*
  RETURNING * INTO v_new_order;

  UPDATE public.quotes
  SET status                = 'accepted',
      accepted_at           = COALESCE(accepted_at, now()),
      converted_to_order_id = v_new_order.id,
      updated_at            = now()
  WHERE id = p_quote_id;

  RETURN v_new_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(uuid, uuid, uuid, jsonb) TO authenticated, service_role;
