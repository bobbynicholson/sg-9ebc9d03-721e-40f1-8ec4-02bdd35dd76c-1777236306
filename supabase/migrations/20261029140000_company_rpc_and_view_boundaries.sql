-- Close SECURITY DEFINER entry points that bypass table RLS.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_company_rpc_scope(target_company uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() = 'service_role' OR
    (auth.uid() IS NULL AND COALESCE(auth.role(), '') = ''
      AND COALESCE(current_setting('role', true), 'none') IN ('none', 'postgres')) THEN RETURN; END IF;
  IF NOT public.company_boundary_allows(target_company) THEN
    RAISE EXCEPTION 'Company access denied' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_company_rpc_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_company_rpc_scope(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_next_document_number(
  p_company_id    uuid,
  p_document_type text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s              public.company_number_settings%ROWTYPE;
  current_year   int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  seq            int;
  formatted      text;
  default_prefix text;
BEGIN
  PERFORM public.assert_company_rpc_scope(p_company_id);
  IF p_document_type NOT IN ('invoice','quote','order') THEN
    RAISE EXCEPTION 'invalid_document_type: %', p_document_type
      USING ERRCODE = 'P0001';
  END IF;

  default_prefix := CASE p_document_type
    WHEN 'invoice' THEN 'INV-'
    WHEN 'quote'   THEN 'QUO-'
    WHEN 'order'   THEN 'ORD-'
    ELSE ''
  END;

  -- Lock the row so two concurrent callers can't read the same seq.
  SELECT * INTO s
  FROM public.company_number_settings
  WHERE company_id = p_company_id
    AND document_type = p_document_type
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.company_number_settings
      (company_id, document_type, prefix, padding, next_number)
    VALUES
      (p_company_id, p_document_type, default_prefix, 6, 1)
    RETURNING * INTO s;
  END IF;

  -- Yearly reset: when include_year + resets_yearly are both on, and
  -- we've crossed into a new calendar year since the last reset, kick
  -- the sequence back to 1.
  IF s.resets_yearly AND s.include_year
     AND (s.last_reset_year IS NULL OR s.last_reset_year < current_year)
  THEN
    s.next_number := 1;
  END IF;

  seq := s.next_number;

  formatted := s.prefix
    || CASE WHEN s.include_year
            THEN current_year::text || s.year_separator
            ELSE '' END
    || lpad(seq::text, s.padding, '0');

  UPDATE public.company_number_settings
  SET next_number = seq + 1,
      last_reset_year = CASE WHEN s.include_year
                             THEN current_year
                             ELSE s.last_reset_year END,
      updated_at = now()
  WHERE company_id = p_company_id
    AND document_type = p_document_type;

  RETURN formatted;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_number_settings_on_insert(
  p_doc_type   text,
  p_number     text,
  p_company_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parsed_match text[];
  parsed_big   bigint;
  parsed       int;
  s            public.company_number_settings%ROWTYPE;
BEGIN
  PERFORM public.assert_company_rpc_scope(p_company_id);
  IF p_number IS NULL OR p_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Only consider the TRAILING numeric run, not all digits in the
  -- string. Legacy formats like ORD-20260208-001 should be parsed as
  -- 1 (the sequence portion), not 20260208001 (which overflows int).
  parsed_match := regexp_match(p_number, '(\d+)$');
  IF parsed_match IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    parsed_big := parsed_match[1]::bigint;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  -- Clamp to int range. If the trailing run is still > int max
  -- (effectively never with a 6-10 digit pad), skip the bump rather
  -- than crash the insert. The settings counter is int by design --
  -- we never need more than ~2 billion documents per tenant.
  IF parsed_big < 1 OR parsed_big > 2147483646 THEN
    RETURN;
  END IF;
  parsed := parsed_big::int;

  SELECT * INTO s FROM public.company_number_settings
  WHERE company_id = p_company_id
    AND document_type = p_doc_type
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-seed so the next consume call doesn't collide with this row.
    INSERT INTO public.company_number_settings
      (company_id, document_type, prefix, padding, next_number)
    VALUES
      (p_company_id, p_doc_type,
       CASE p_doc_type WHEN 'invoice' THEN 'INV-' WHEN 'quote' THEN 'QUO-' WHEN 'order' THEN 'ORD-' ELSE '' END,
       6, parsed + 1);
    RETURN;
  END IF;

  IF parsed >= s.next_number THEN
    UPDATE public.company_number_settings
    SET next_number = parsed + 1, updated_at = now()
    WHERE company_id = p_company_id
      AND document_type = p_doc_type;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_next_document_number(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bump_number_settings_on_insert(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_next_document_number(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bump_number_settings_on_insert(text, text, uuid) TO authenticated, service_role;

-- A link mint is a grant of access. It must run only after a server route
-- has checked the caller's company and permission for the specific order.
-- Include all overloads; PostgreSQL grants EXECUTE to PUBLIC by default.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('mint_client_order_token', 'mint_client_account_token', 'dispatch_webhook')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
  END LOOP;
END $$;

-- Revoking anon alone does not revoke access inherited through PUBLIC.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('convert_quote_to_order', 'rotate_company_embed_token',
       'enable_comms_for_import_job', 'is_comms_paused_for_email')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.signature);
  END LOOP;
END $$;

-- Company aggregate views must evaluate their underlying tables as the
-- requesting user. Otherwise an owner-created view can bypass table RLS.
-- Extension members (PostGIS geography_columns/geometry_columns, etc.)
-- are maintained by their extension and may have a different owner.
-- Identify membership from the catalogs; do not skip application views
-- merely because their names or owners resemble extension objects.
DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND d.objsubid = 0 AND d.refclassid = 'pg_extension'::regclass
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.relname);
  END LOOP;
END $$;
COMMIT;
