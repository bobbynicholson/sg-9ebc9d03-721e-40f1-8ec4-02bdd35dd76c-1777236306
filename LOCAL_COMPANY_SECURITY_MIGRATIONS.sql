-- Complete company isolation rollout. Generated from the four source migrations.
-- Run the ENTIRE file in Supabase SQL Editor as the database administrator.
-- Deploy the updated app (including /api/company-files) with this database change.
-- This file does not revoke previously issued signed URLs or deploy the app.
-- Source migration versions remain available for the normal migration runner;
-- this manual bundle does not modify supabase_migrations migration history.
-- A later normal migration run can safely repeat these idempotent statements.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $company_security_preflight$
DECLARE missing text;
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'Company security rollout requires PostgreSQL 15 or newer';
  END IF;
  IF current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Run this rollout as the database administrator in SQL Editor';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.role()') IS NULL THEN
    RAISE EXCEPTION 'This is not the expected Supabase database: auth helpers are missing';
  END IF;
  SELECT string_agg(name, ', ' ORDER BY name) INTO missing
  FROM unnest(ARRAY['public.profiles', 'public.companies', 'public.user_departments',
    'public.orders', 'public.company_number_settings', 'storage.buckets', 'storage.objects']) AS required(name)
  WHERE to_regclass(name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Required tables are missing: %', missing; END IF;
  SELECT string_agg(id, ', ' ORDER BY id) INTO missing
  FROM unnest(ARRAY['imports', 'purchase-receipts', 'equipment-damage-photos', 'pod']) AS required(id)
  WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = required.id);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Required document buckets are missing: %', missing; END IF;
END;
$company_security_preflight$;

-- Source: 20261029120000_company_isolation_boundary.sql
-- Defence in depth: permissive policies are ORed, so one broad policy can
-- reopen a tenant table. These restrictive policies always require company
-- membership as well as the existing role/branch/client permissions.

-- Retire any legacy preference/assignment that claimed platform authority
-- without a canonical platform role. No legitimate tenant portal needs it.
UPDATE public.profiles SET active_role = role::text
WHERE active_role::text = 'super_admin' AND role::text <> 'super_admin';
DELETE FROM public.user_departments ud USING public.profiles p
WHERE p.id = ud.user_id AND ud.department::text = 'super_admin' AND p.role::text <> 'super_admin';

CREATE OR REPLACE FUNCTION public.company_boundary_allows(target_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active IS NOT FALSE AND p.deleted_at IS NULL
      AND (p.role::text = 'super_admin'
        OR (target_company IS NOT NULL AND p.company_id = target_company))
  );
$$;
REVOKE ALL ON FUNCTION public.company_boundary_allows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_boundary_allows(uuid) TO anon, authenticated, service_role;

DO $$
DECLARE t record; read_rule text; write_rule text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND a.attname = 'company_id' AND a.atttypid = 'uuid'::regtype
      AND NOT a.attisdropped AND c.relname <> 'profiles'
  LOOP
    write_rule := 'public.company_boundary_allows(company_id)';
    read_rule := write_rule;
    -- Only published/shared reference rows may be read without a company.
    -- Existing policies still decide which of these rows are visible.
    IF t.relname = ANY(ARRAY['allergens', 'email_templates', 'public_holidays',
      'training_materials', 'blog_posts', 'cms_pages', 'whatsapp_templates']) THEN
      read_rule := '(' || write_rule || ' OR company_id IS NULL)';
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS company_boundary_select ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS company_boundary_insert ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS company_boundary_update ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS company_boundary_delete ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY company_boundary_select ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (%s)', t.relname, read_rule);
    EXECUTE format('CREATE POLICY company_boundary_insert ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (%s)', t.relname, write_rule);
    EXECUTE format('CREATE POLICY company_boundary_update ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (%s) WITH CHECK (%s)', t.relname, write_rule, write_rule);
    EXECUTE format('CREATE POLICY company_boundary_delete ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (%s)', t.relname, write_rule);
  END LOOP;
END $$;

-- A pending user can still read/edit personal profile fields. The trigger
-- below prevents that exception from changing membership or permissions.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_boundary ON public.profiles;
CREATE POLICY company_boundary ON public.profiles AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (id = (SELECT auth.uid()) OR public.company_boundary_allows(company_id))
  WITH CHECK (id = (SELECT auth.uid()) OR public.company_boundary_allows(company_id));

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_boundary ON public.companies;
CREATE POLICY company_boundary ON public.companies AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (public.company_boundary_allows(id))
  WITH CHECK (public.company_boundary_allows(id));

-- Child tables without company_id inherit their parent's boundary. No
-- permissions are granted here; existing client/role rules still apply.
DO $$
DECLARE r record; rule text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('user_departments', 'user_id', 'profiles'),
    ('import_rows', 'job_id', 'import_jobs'),
    ('import_events', 'job_id', 'import_jobs'),
    ('recipe_ingredients', 'recipe_id', 'recipes'),
    ('purchase_receipt_items', 'receipt_id', 'purchase_receipts'),
    ('support_ticket_messages', 'ticket_id', 'support_tickets'),
    ('delivery_route_stops', 'order_id', 'orders'),
    ('order_status_history', 'order_id', 'orders'),
    ('payment_reminders', 'order_id', 'orders'),
    ('shopping_list_items', 'shopping_list_id', 'shopping_lists'),
    ('menu_item_price_history', 'menu_item_id', 'menu_items'),
    ('order_items', 'order_id', 'orders'),
    ('account_deletion_requests', 'user_id', 'profiles'),
    ('driver_confirmations', 'order_id', 'orders'),
    ('recipe_scaling_history', 'order_id', 'orders'),
    ('payment_gateway_credentials', 'gateway_id', 'payment_gateways'),
    ('recurring_invoice_runs', 'template_id', 'recurring_invoice_templates'),
    ('kitchen_task_completions', 'order_id', 'orders')
  ) AS links(child_table, child_column, parent_table)
  LOOP
    IF to_regclass('public.' || r.child_table) IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = r.child_table AND column_name = r.child_column
    ) THEN CONTINUE; END IF;
    rule := format('EXISTS (SELECT 1 FROM public.%I parent WHERE parent.id = %I.%I AND public.company_boundary_allows(parent.company_id))', r.parent_table, r.child_table, r.child_column);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.child_table);
    EXECUTE format('DROP POLICY IF EXISTS parent_company_boundary ON public.%I', r.child_table);
    EXECUTE format('CREATE POLICY parent_company_boundary ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (%s) WITH CHECK (%s)', r.child_table, rule, rule);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_profile_immutable_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller public.profiles%ROWTYPE; admin_managing boolean;
BEGIN
  -- Supabase service credentials and database maintenance can provision
  -- membership. A missing user id under an anonymous JWT is never a bypass.
  IF auth.role() = 'service_role' OR
     (auth.uid() IS NULL AND COALESCE(auth.role(), '') = ''
       AND COALESCE(current_setting('role', true), 'none') IN ('none', 'postgres')) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO caller FROM public.profiles WHERE id = auth.uid();
  IF caller.id IS NULL OR caller.is_active IS FALSE OR caller.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account is not authorised' USING ERRCODE = '42501';
  END IF;
  IF caller.role::text = 'super_admin' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Profiles must be provisioned through the account service' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Company membership cannot be changed directly' USING ERRCODE = '42501';
  END IF;
  admin_managing := caller.company_id = OLD.company_id
    AND caller.role::text IN ('owner', 'company_admin', 'admin');
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT COALESCE(admin_managing, false) OR NEW.role::text = 'super_admin'
      OR (caller.role::text = 'admin' AND
        (NEW.role::text IN ('owner', 'company_admin') OR OLD.role::text IN ('owner', 'company_admin', 'super_admin'))) THEN
      RAISE EXCEPTION 'Role assignment is not authorised' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NOT COALESCE(admin_managing, false) AND (
    NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.region_id IS DISTINCT FROM OLD.region_id OR NEW.email IS DISTINCT FROM OLD.email
  ) THEN
    RAISE EXCEPTION 'Account access fields require an administrator' USING ERRCODE = '42501';
  END IF;
  IF NEW.active_role IS DISTINCT FROM OLD.active_role AND
    NOT (NEW.active_role::text = NEW.role::text OR EXISTS (
      SELECT 1 FROM public.user_departments ud WHERE ud.user_id = OLD.id
        AND CASE ud.department::text
          WHEN 'kitchen' THEN 'kitchen_staff' WHEN 'cleaning' THEN 'cleaning_staff'
          WHEN 'shopping' THEN 'shopping_staff' WHEN 'buyer' THEN 'shopping_staff'
          WHEN 'waitering' THEN 'waiter' WHEN 'server' THEN 'waiter'
          ELSE ud.department::text END = NEW.active_role::text
    )) THEN
    RAISE EXCEPTION 'Portal role is not assigned to this account' USING ERRCODE = '42501';
  END IF;
  IF NEW.active_role::text = 'super_admin' AND NEW.role::text <> 'super_admin' THEN
    RAISE EXCEPTION 'Platform access cannot be assigned by a company' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_profile_immutable ON public.profiles;
CREATE TRIGGER trg_enforce_profile_immutable BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_immutable_columns();
REVOKE ALL ON FUNCTION public.enforce_profile_immutable_columns() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_department_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller_role text;
BEGIN
  IF auth.role() = 'service_role' OR
     (auth.uid() IS NULL AND COALESCE(auth.role(), '') = ''
       AND COALESCE(current_setting('role', true), 'none') IN ('none', 'postgres')) THEN RETURN NEW; END IF;
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role = 'super_admin' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.department IS DISTINCT FROM OLD.department THEN
    IF COALESCE(caller_role, '') NOT IN ('owner', 'company_admin', 'admin') THEN
      RAISE EXCEPTION 'Role assignments require an administrator' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.department::text = 'super_admin' OR
    (NEW.department::text IN ('owner', 'company_admin') AND COALESCE(caller_role, '') NOT IN ('owner', 'company_admin')) THEN
    RAISE EXCEPTION 'Role assignment is not authorised' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_department_privileges ON public.user_departments;
CREATE TRIGGER guard_department_privileges BEFORE INSERT OR UPDATE ON public.user_departments
  FOR EACH ROW EXECUTE FUNCTION public.guard_department_privileges();
REVOKE ALL ON FUNCTION public.guard_department_privileges() FROM PUBLIC, anon, authenticated;

-- Source: 20261029130000_private_company_documents.sql
-- Deploy the authenticated file endpoint and updated callers together with
-- this migration. Public storage downloads bypass SELECT policies entirely.
UPDATE storage.buckets SET public = false
WHERE id IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod');

-- Existing imports buckets may accept only CSV/Excel even though receipt
-- scanners persist images there. Preserve existing import formats and allow
-- the receipt formats used by the app when a MIME allowlist is configured.
UPDATE storage.buckets b SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime FROM unnest(b.allowed_mime_types ||
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) AS types(mime)
)
WHERE b.id = 'imports' AND b.allowed_mime_types IS NOT NULL;

CREATE OR REPLACE FUNCTION public.company_storage_path_allowed(bucket text, object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN bucket = 'pod' THEN
      split_part(object_name, '/', 1) = 'orders' AND EXISTS (
        SELECT 1 FROM public.orders o WHERE o.id::text = split_part(object_name, '/', 2)
          AND public.company_boundary_allows(o.company_id)
      )
    ELSE EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
        AND p.is_active IS NOT FALSE AND p.deleted_at IS NULL
        AND (p.role::text = 'super_admin' OR
          (p.company_id IS NOT NULL AND split_part(object_name, '/', 1) = p.company_id::text))
    ) END;
$$;
REVOKE ALL ON FUNCTION public.company_storage_path_allowed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_storage_path_allowed(text, text) TO anon, authenticated, service_role;

-- Restrictive: also constrains any legacy broad INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS company_documents_boundary ON storage.objects;
CREATE POLICY company_documents_boundary ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (bucket_id NOT IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod')
  OR public.company_storage_path_allowed(bucket_id, name))
WITH CHECK (bucket_id NOT IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod')
  OR public.company_storage_path_allowed(bucket_id, name));

DROP POLICY IF EXISTS company_documents_read ON storage.objects;
CREATE POLICY company_documents_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod')
  AND public.company_storage_path_allowed(bucket_id, name));

-- Source: 20261029140000_company_rpc_and_view_boundaries.sql
-- Close SECURITY DEFINER entry points that bypass table RLS.

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

-- Source: 20261029150000_company_relationship_integrity.sql
-- A company-owned row must not link a business record from another company.
-- Plain UUID foreign keys alone do not enforce this. Check new/changed links
-- even for service-role writes so API mistakes cannot mix tenant records.
CREATE OR REPLACE FUNCTION public.enforce_company_relationship()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE child jsonb := to_jsonb(NEW); parent_company uuid; child_company uuid;
  referenced_id uuid; parent_found boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND child -> TG_ARGV[0] IS NOT DISTINCT FROM to_jsonb(OLD) -> TG_ARGV[0]
    AND child -> 'company_id' IS NOT DISTINCT FROM to_jsonb(OLD) -> 'company_id'
    AND (TG_NARGS < 6 OR child -> TG_ARGV[3] IS NOT DISTINCT FROM to_jsonb(OLD) -> TG_ARGV[3]) THEN RETURN NEW; END IF;
  child_company := (child ->> 'company_id')::uuid;
  IF TG_NARGS = 6 THEN
    EXECUTE format('SELECT company_id FROM public.%I WHERE %I = $1', TG_ARGV[4], TG_ARGV[5])
      INTO child_company USING (child ->> TG_ARGV[3])::uuid;
  END IF;
  referenced_id := (child ->> TG_ARGV[0])::uuid;
  IF referenced_id IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT company_id, true FROM public.%I WHERE %I = $1', TG_ARGV[1], TG_ARGV[2])
    INTO parent_company, parent_found USING referenced_id;
  -- Missing parents remain the foreign key's responsibility. NULL-company
  -- reference rows are allowed only in explicitly shared catalogues.
  IF parent_found IS NOT TRUE THEN RETURN NEW; END IF;
  IF parent_company IS NULL AND TG_ARGV[1] = ANY(ARRAY['allergens', 'public_holidays', 'training_materials']) THEN RETURN NEW; END IF;
  IF child_company IS NULL OR parent_company IS DISTINCT FROM child_company THEN
    RAISE EXCEPTION 'Related record must belong to the same company' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_company_relationship() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT child.relname AS child_table, ca.attname AS child_column,
      parent.relname AS parent_table, pa.attname AS parent_column, con.oid
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace cn ON cn.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace pn ON pn.oid = parent.relnamespace
    JOIN pg_attribute ca ON ca.attrelid = child.oid AND ca.attnum = con.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = con.confkey[1]
    WHERE con.contype = 'f' AND cardinality(con.conkey) = 1
      AND cn.nspname = 'public' AND pn.nspname = 'public'
      AND ca.atttypid = 'uuid'::regtype AND pa.atttypid = 'uuid'::regtype
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = child.oid AND a.attname = 'company_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = parent.oid AND a.attname = 'company_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
      AND child.relname <> 'profiles'
      AND (parent.relname = ANY(ARRAY['clients', 'orders', 'quotes', 'leads', 'regions',
        'menu_items', 'booking_packages', 'equipment', 'equipment_kits', 'inventory_items',
        'suppliers', 'recipes', 'shopping_lists', 'purchase_receipts', 'import_jobs',
        'outsource_providers', 'kitchen_shifts', 'kitchen_staff_shifts', 'vehicles', 'invoices',
        'allergens', 'public_holidays', 'training_materials'])
        OR (parent.relname = 'profiles' AND ca.attname IN
          ('assigned_driver_id', 'secondary_driver_id', 'assigned_chef_id', 'staff_id', 'driver_id', 'waiter_id')))
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'company_fk_' || fk.child_column, fk.child_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationship(%L, %L, %L)',
      'company_fk_' || fk.child_column, fk.child_table, fk.child_column, fk.parent_table, fk.parent_column);
  END LOOP;
END $$;

-- Line items inherit ownership through their order/recipe/list instead of
-- carrying company_id. Validate catalogue references against that owner.
DO $$
DECLARE link record; fk record;
BEGIN
  FOR link IN SELECT * FROM (VALUES
    ('order_items', 'order_id', 'orders'),
    ('recipe_ingredients', 'recipe_id', 'recipes'),
    ('shopping_list_items', 'shopping_list_id', 'shopping_lists'),
    ('purchase_receipt_items', 'receipt_id', 'purchase_receipts'),
    ('delivery_route_stops', 'order_id', 'orders'),
    ('driver_confirmations', 'order_id', 'orders'),
    ('kitchen_task_completions', 'order_id', 'orders')
  ) AS ownership(child_table, owner_column, owner_table)
  LOOP
    IF to_regclass('public.' || link.child_table) IS NULL OR EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = link.child_table AND column_name = 'company_id'
    ) THEN CONTINUE; END IF;
    FOR fk IN SELECT ca.attname AS child_column, parent.relname AS parent_table,
        pa.attname AS parent_column
      FROM pg_constraint con
      JOIN pg_class parent ON parent.oid = con.confrelid
      JOIN pg_namespace pn ON pn.oid = parent.relnamespace
      JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = con.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = con.confkey[1]
      WHERE con.contype = 'f' AND cardinality(con.conkey) = 1
        AND con.conrelid = to_regclass('public.' || link.child_table)
        AND pn.nspname = 'public' AND ca.attname <> link.owner_column
        AND ca.atttypid = 'uuid'::regtype
        AND parent.relname = ANY(ARRAY['orders', 'menu_items', 'equipment', 'inventory_items', 'recipes', 'suppliers', 'vehicles'])
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = parent.oid AND a.attname = 'company_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'company_fk_' || fk.child_column, link.child_table);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationship(%L, %L, %L, %L, %L, %L)',
        'company_fk_' || fk.child_column, link.child_table, fk.child_column, fk.parent_table, fk.parent_column,
        link.owner_column, link.owner_table, 'id');
    END LOOP;
  END LOOP;
END $$;

-- Every one of the standalone verification checks must pass BEFORE COMMIT.
DO $company_security_verify$
DECLARE failed_checks text;
BEGIN
  SELECT string_agg(check_name, ', ' ORDER BY check_name) INTO failed_checks
  FROM (
-- Read-only structural checks after LOCAL_COMPANY_SECURITY_MIGRATIONS.sql.
-- Expect every row's passed value to be true. This does not test HTTP access
-- or revoke old signed URLs; repeat the two-company application/storage checks.
WITH required_buckets(id) AS (
  VALUES ('imports'), ('purchase-receipts'), ('equipment-damage-photos'), ('pod')
), company_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
    AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'profiles'
), checks AS (
  SELECT 'private_bucket:' || required.id AS check_name,
    COALESCE(b.public IS FALSE AND b.id IS NOT NULL, false) AS passed
  FROM required_buckets required LEFT JOIN storage.buckets b ON b.id = required.id
  UNION ALL
  SELECT 'imports_receipt_mime_types', EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'imports' AND (allowed_mime_types IS NULL OR
      allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
  )
  UNION ALL
  SELECT 'storage_rls_enabled', EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'storage.objects'::regclass AND relrowsecurity
  )
  UNION ALL
  SELECT 'storage_restrictive_boundary', EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'company_documents_boundary' AND permissive = 'RESTRICTIVE' AND cmd = 'ALL'
  )
  UNION ALL
  SELECT 'company_tables_restrictive_boundaries', EXISTS (SELECT 1 FROM company_tables) AND NOT EXISTS (
    SELECT 1 FROM company_tables c WHERE NOT c.relrowsecurity OR EXISTS (
      SELECT 1 FROM (VALUES ('company_boundary_select','SELECT'), ('company_boundary_insert','INSERT'),
        ('company_boundary_update','UPDATE'), ('company_boundary_delete','DELETE')) AS required(name, cmd)
      WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public'
        AND p.tablename = c.relname AND p.policyname = required.name
        AND p.cmd = required.cmd AND p.permissive = 'RESTRICTIVE')
    )
  )
  UNION ALL
  SELECT 'profiles_and_companies_boundaries', NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['profiles','companies']) AS required(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_policies p JOIN pg_class c ON c.relname = p.tablename
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
      WHERE p.schemaname = 'public' AND p.tablename = required.name AND p.policyname = 'company_boundary'
        AND p.permissive = 'RESTRICTIVE' AND p.cmd = 'ALL' AND c.relrowsecurity)
  )
  UNION ALL
  SELECT 'profile_privilege_guard', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_enforce_profile_immutable' AND tgenabled IN ('O','A')
  )
  UNION ALL
  SELECT 'department_privilege_guard', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_departments'::regclass
      AND tgname = 'guard_department_privileges' AND tgenabled IN ('O','A')
  )
  UNION ALL
  SELECT 'required_security_functions', NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['public.company_boundary_allows(uuid)',
      'public.company_storage_path_allowed(text,text)', 'public.assert_company_rpc_scope(uuid)',
      'public.enforce_company_relationship()']) AS required(signature)
    WHERE to_regprocedure(signature) IS NULL
  )
  UNION ALL
  SELECT 'views_use_caller_permissions', NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND d.objsubid = 0 AND d.refclassid = 'pg_extension'::regclass
          AND d.deptype = 'e'
      )
      AND NOT COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false)
  )
  UNION ALL
  SELECT 'privileged_functions_deny_user_execution', NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('mint_client_order_token', 'mint_client_account_token', 'dispatch_webhook')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  )
)
SELECT check_name, passed FROM checks ORDER BY check_name
  ) AS verification WHERE passed IS NOT TRUE;
  IF failed_checks IS NOT NULL THEN
    RAISE EXCEPTION 'Company security verification failed: %', failed_checks;
  END IF;
END;
$company_security_verify$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- A successful result is produced only AFTER the whole transaction commits.
SELECT 'company_security_rollout_committed' AS result;
SELECT id AS bucket, public AS is_public FROM storage.buckets
WHERE id IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod') ORDER BY id;
