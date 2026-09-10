-- api_create_lead doesn't set region_id, which has been NOT NULL on
-- leads since migration 20260521110000. Every inbound integration
-- lead (Zapier, Make, Facebook Lead Ads, custom API consumers) fails
-- with "null value in column region_id of relation leads violates
-- not-null constraint" at insert time.
--
-- Fix: pick the company's oldest active region inside the function
-- and use it as the default. Mirrors the strategy resolveDefaultRegionId
-- in src/lib/defaultRegion.ts uses on the client side.
--
-- If the company has no region at all (mis-onboarded legacy tenants),
-- return a structured failure rather than letting the NOT NULL throw
-- bubble up - the API consumer gets a clear error code, the operator
-- gets surfaced as the fix path.

CREATE OR REPLACE FUNCTION public.api_create_lead(p_key_hash text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key       RECORD;
  v_lead_id   uuid;
  v_region_id uuid;
BEGIN
  SELECT id, company_id, scopes, is_active, revoked_at
    INTO v_key
    FROM api_keys
    WHERE key_hash = p_key_hash
    LIMIT 1;

  IF v_key.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_key');
  END IF;
  IF NOT v_key.is_active OR v_key.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'revoked');
  END IF;
  IF NOT ('leads:write' = ANY (v_key.scopes)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_scope');
  END IF;

  IF NULLIF(p_payload->>'contact_name','') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'contact_name_required');
  END IF;

  -- Resolve the company's default region. Oldest active row matches
  -- what the backfill migration did, so new inbound leads land in
  -- the same bucket as historic ones.
  SELECT id INTO v_region_id
    FROM regions
    WHERE company_id = v_key.company_id
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

  IF v_region_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_region_configured');
  END IF;

  INSERT INTO leads (
    company_id, region_id, contact_name, email, phone,
    event_type, event_date, guest_count, budget_range, venue_address,
    status, source, notes, tags
  ) VALUES (
    v_key.company_id,
    v_region_id,
    p_payload->>'contact_name',
    NULLIF(p_payload->>'email',''),
    NULLIF(p_payload->>'phone',''),
    NULLIF(p_payload->>'event_type',''),
    NULLIF(p_payload->>'event_date','')::date,
    NULLIF(p_payload->>'guest_count','')::integer,
    NULLIF(p_payload->>'budget_range',''),
    NULLIF(p_payload->>'venue_address',''),
    'new',
    COALESCE(NULLIF(p_payload->>'source',''),'api'),
    NULLIF(p_payload->>'notes',''),
    CASE WHEN p_payload ? 'tags' AND jsonb_typeof(p_payload->'tags')='array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags'))
         ELSE NULL END
  )
  RETURNING id INTO v_lead_id;

  UPDATE api_keys SET last_used_at = now() WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'company_id', v_key.company_id
  );
END $function$;
