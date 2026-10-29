-- Defence in depth: permissive policies are ORed, so one broad policy can
-- reopen a tenant table. These restrictive policies always require company
-- membership as well as the existing role/branch/client permissions.
BEGIN;

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

COMMIT;
