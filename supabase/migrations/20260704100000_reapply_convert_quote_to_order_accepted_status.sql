-- Re-apply convert_quote_to_order with the status='accepted' UPDATE.
--
-- Prod drift (found 2026-07-04 via the admin "Mark accepted" test): the
-- live convert_quote_to_order body back-linked the order
-- (converted_to_order_id) but did NOT flip status off 'draft', so a draft
-- quote tripped the quotes_draft_implies_no_conversion CHECK constraint
-- (added 20260603130000) and the whole conversion rolled back. Symptom:
-- toast "new row for relation quotes violates check constraint
-- quotes_draft_implies_no_conversion" on Mark accepted for any draft.
--
-- Root cause: migration 20260602190000 (which added the status='accepted'
-- line to the quote UPDATE) was never applied to this prod DB, while the
-- later constraint migration was - classic partial-application drift.
-- This migration is a verbatim re-apply of the CURRENT function body so
-- prod matches the repo. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.convert_quote_to_order(
  p_quote_id        uuid,
  p_company_id      uuid,
  p_actor_user_id   uuid,
  p_order_payload   jsonb
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote        public.quotes%ROWTYPE;
  v_new_order    public.orders%ROWTYPE;
  v_payload      jsonb := COALESCE(p_order_payload, '{}'::jsonb);
  v_order_number text;
  v_caller       uuid := auth.uid();
  v_caller_role  text;
  v_caller_company uuid;
BEGIN
  IF v_caller IS NOT NULL THEN
    SELECT COALESCE(active_role, role::text), company_id
      INTO v_caller_role, v_caller_company
      FROM public.profiles
     WHERE id = v_caller;

    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'convert_quote_to_order: caller has no profile'
        USING ERRCODE = '42501';
    END IF;

    IF v_caller_role <> 'super_admin'
       AND (v_caller_company IS DISTINCT FROM p_company_id) THEN
      RAISE EXCEPTION 'convert_quote_to_order: caller not authorised for company %', p_company_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

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

  -- TIGHTEN I.110: clear stale lost_reason + rejected_at on the
  -- accept-stamp. Previous code left these intact, so a quote that
  -- had been through a rejected/cancelled cycle ended up with
  -- contradictory state (status='accepted' but lost_reason=
  -- 'order_cancelled') - aggregators bucketed it as won_then_cancelled
  -- forever. Setting them to NULL here means "this row is freshly
  -- accepted" regardless of history.
  UPDATE public.quotes
  SET status                = 'accepted',
      accepted_at           = COALESCE(accepted_at, now()),
      converted_to_order_id = v_new_order.id,
      lost_reason           = NULL,
      rejected_at           = NULL,
      updated_at            = now()
  WHERE id = p_quote_id;

  RETURN v_new_order;
END;
$function$;
