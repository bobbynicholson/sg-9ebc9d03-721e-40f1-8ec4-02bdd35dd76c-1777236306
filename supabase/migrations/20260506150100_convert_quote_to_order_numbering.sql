-- Recreate convert_quote_to_order so it consumes a real numbered
-- order_number via consume_next_document_number, instead of relying
-- on the TS caller to pass ORD-{first 8 of UUID}. Eliminates the
-- collision risk on retry that the running-todo audit flagged.

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

  -- Force the tenant + identity columns from the locked quote so a
  -- malicious or buggy caller cannot smuggle in a different
  -- company_id / quote_id via the payload.
  v_payload := v_payload
    || jsonb_build_object(
         'company_id', v_quote.company_id,
         'quote_id',   v_quote.id
       );

  -- Always assign the order_number from the per-tenant counter --
  -- ignore any order_number the caller put in the payload (legacy
  -- path used to put ORD-{first 8 of UUID} there). Atomic and
  -- collision-safe across concurrent acceptances.
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

COMMENT ON FUNCTION public.convert_quote_to_order(uuid, uuid, uuid, jsonb) IS
  'Atomically inserts an order from a quote and back-links the quote. order_number now comes from consume_next_document_number (per-tenant counter) instead of UUID slicing.';

GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(uuid, uuid, uuid, jsonb) TO authenticated, service_role;
