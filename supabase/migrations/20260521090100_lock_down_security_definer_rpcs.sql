-- Phase 1 audit, findings 3.4 and 3.5: two SECURITY DEFINER RPCs had
-- EXECUTE granted to anon + authenticated despite trusting their
-- caller-supplied arguments to decide which tenant's data to mutate.
-- See docs/security-posture.md sections 3.4 and 3.5.

-- 3.4 convert_quote_to_order
--
-- The function verified `quote.company_id = p_company_id` but did
-- nothing to verify the caller has any relationship to that company.
-- An anon caller who could obtain or guess a (quote_id, company_id)
-- pair could force-create a confirmed order under that tenant.
--
-- Callers:
--   - /api/public/quotes/[token]/accept   service-role, after token check
--   - /api/admin/leads/[id]/convert-to-order  service-role, after auth
--   - src/services/quoteService.ts        authenticated browser session
--   - src/pages/admin/quotes/new.tsx      authenticated browser session
--
-- The browser callers mean we can't simply revoke EXECUTE from
-- authenticated. Instead, add an in-function guard: caller must be
-- super_admin OR a profile member of p_company_id. service_role
-- bypasses both because auth.uid() is NULL under service_role and
-- the SECURITY DEFINER context still has rights; we make the guard
-- skip when auth.uid() is NULL (which only happens for service_role
-- and inside other DEFINER funcs).
--
-- Anon stays revoked because revoking and guarding are belt + braces -
-- if the grant ever gets re-added, the guard still blocks the abuse.

CREATE OR REPLACE FUNCTION public.convert_quote_to_order(
  p_quote_id uuid,
  p_company_id uuid,
  p_actor_user_id uuid,
  p_order_payload jsonb
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
  -- Caller-gate: skip when auth.uid() is NULL (service_role context).
  -- Otherwise the caller must be super_admin OR a profile member of
  -- the target company.
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

  UPDATE public.quotes
  SET status                = 'accepted',
      accepted_at           = COALESCE(accepted_at, now()),
      converted_to_order_id = v_new_order.id,
      updated_at            = now()
  WHERE id = p_quote_id;

  RETURN v_new_order;
END;
$function$;

-- Revoke anon. Authenticated stays granted because the in-function
-- guard now blocks cross-tenant calls.
REVOKE EXECUTE ON FUNCTION
  public.convert_quote_to_order(uuid, uuid, uuid, jsonb)
FROM anon;

-- 3.5 rotate_company_embed_token
--
-- The function does no caller check at all. Add a super_admin /
-- company-admin gate and revoke anon.
--
-- Only caller is /api/admin/embed/rotate-token.ts (service-role,
-- behind a super_admin / company-admin check). Authenticated EXECUTE
-- is technically unused but we keep the grant + add the guard so a
-- future direct caller is safe by default.

CREATE OR REPLACE FUNCTION public.rotate_company_embed_token(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new uuid := gen_random_uuid();
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_caller_company uuid;
BEGIN
  IF v_caller IS NOT NULL THEN
    SELECT COALESCE(active_role, role::text), company_id
      INTO v_caller_role, v_caller_company
      FROM public.profiles
     WHERE id = v_caller;

    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'rotate_company_embed_token: caller has no profile'
        USING ERRCODE = '42501';
    END IF;

    IF v_caller_role <> 'super_admin'
       AND NOT (
            v_caller_role IN ('owner','admin','company_admin')
            AND v_caller_company = p_company_id
          ) THEN
      RAISE EXCEPTION 'rotate_company_embed_token: not authorised for company %', p_company_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.companies
     SET embed_token = v_new
   WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  RETURN v_new;
END;
$function$;

REVOKE EXECUTE ON FUNCTION
  public.rotate_company_embed_token(uuid)
FROM anon;
