-- Transactional quote -> order conversion.
--
-- Why this exists:
-- The TS-side quoteService.convertQuoteToOrder used to do
--   1) INSERT into orders
--   2) UPDATE quotes SET converted_to_order_id = newOrder.id
-- as two separate round-trips. If step 2 failed (network blip, RLS
-- mismatch, anything), we ended up with an orphan order: the order
-- existed, the quote was still in 'sent' state with no back-link, and
-- a re-acceptance would silently create a SECOND order.
--
-- Wrapping the pair in a single Postgres function gives us proper
-- transactional semantics. If anything inside RAISES, both rows are
-- rolled back atomically. The cascading side-effects (auto-invoice,
-- kitchen prep, confirmation email) intentionally stay on the TS side
-- and run AFTER this function commits, since they're correct as
-- non-blocking fire-and-forget work.
--
-- Concurrency: the SELECT ... FOR UPDATE on the quote row blocks any
-- second caller racing on the same quote. The second caller will see
-- converted_to_order_id IS NOT NULL after the first commits and gets
-- a clean "already converted" exception instead of a duplicate order.

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
BEGIN
  -- Lock the quote row so a concurrent acceptance can't double-insert.
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

  -- Default status if the caller didn't set one. Acceptance IS the
  -- commitment moment, so we go straight to 'confirmed' (see comment
  -- in convertQuoteToOrder for the full reasoning).
  IF NOT (v_payload ? 'status') OR v_payload->>'status' IS NULL THEN
    v_payload := v_payload || jsonb_build_object('status', 'confirmed');
  END IF;

  -- Insert the order from the merged payload. jsonb_populate_record
  -- maps the JSON keys onto the orders rowtype, ignoring unknown keys
  -- and respecting NULL defaults.
  INSERT INTO public.orders
  SELECT (jsonb_populate_record(NULL::public.orders, v_payload)).*
  RETURNING * INTO v_new_order;

  -- Back-link the quote and stamp acceptance. accepted_at is preserved
  -- if it was set earlier (e.g. client self-accepted on the public page
  -- and the operator is just now converting).
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
  'Atomically inserts an order from a quote and back-links the quote. Locks the quote row, validates tenant + not-already-converted, returns the new order. Side-effects (invoice, kitchen prep, email) stay in TS-land.';

-- Service role + authenticated users invoke this through the supabase
-- client. RLS on the underlying tables still applies for non-definer
-- contexts; SECURITY DEFINER lets us guarantee the lock + linkage even
-- if the caller's RLS policy would have permitted only one of the two
-- writes.
GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(uuid, uuid, uuid, jsonb) TO authenticated, service_role;
