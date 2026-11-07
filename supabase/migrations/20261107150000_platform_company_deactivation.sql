-- Platform owners can disable a company workspace without deleting its data.
-- Tenant sessions retain their company/profile rows but cannot read or write
-- company business data while the workspace is disabled.
BEGIN;

CREATE OR REPLACE FUNCTION public.company_tenant_active_boundary_allows(target_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.company_boundary_allows(target_company)
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = target_company
          AND c.is_active IS NOT FALSE
          AND c.deleted_at IS NULL
      )
    );
$$;

REVOKE ALL ON FUNCTION public.company_tenant_active_boundary_allows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_tenant_active_boundary_allows(uuid) TO anon, authenticated, service_role;

-- Preserve global reference rows, while adding an active-workspace condition
-- to all company-scoped reads and writes. Existing policies still determine
-- which rows each role may access.
DO $$
DECLARE t record; active_rule text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND a.attname = 'company_id' AND a.atttypid = 'uuid'::regtype
      AND NOT a.attisdropped AND c.relname NOT IN ('profiles', 'companies')
  LOOP
    active_rule := format('public.company_tenant_active_boundary_allows(company_id)');
    IF t.relname = ANY(ARRAY['allergens', 'email_templates', 'public_holidays',
      'training_materials', 'blog_posts', 'cms_pages', 'whatsapp_templates']) THEN
      active_rule := '(' || active_rule || ' OR company_id IS NULL)';
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS company_active_boundary ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY company_active_boundary ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (%s) WITH CHECK (%s)',
      t.relname, active_rule, active_rule);
  END LOOP;
END $$;

-- Keep a user's own profile available for sign-out and account recovery, but
-- do not expose other tenant profiles or their role assignments when disabled.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_active_profile_boundary ON public.profiles;
CREATE POLICY company_active_profile_boundary ON public.profiles AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (id = (SELECT auth.uid()) OR public.company_tenant_active_boundary_allows(company_id))
  WITH CHECK (id = (SELECT auth.uid()) OR public.company_tenant_active_boundary_allows(company_id));

-- A disabled company can still be read by its own members so middleware can
-- route them to the explanation page. Only platform owners can change it.
DROP POLICY IF EXISTS company_active_insert ON public.companies;
DROP POLICY IF EXISTS company_active_update ON public.companies;
DROP POLICY IF EXISTS company_active_delete ON public.companies;
CREATE POLICY company_active_insert ON public.companies AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_super_admin() OR is_active IS NOT FALSE);
CREATE POLICY company_active_update ON public.companies AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.is_super_admin() OR is_active IS NOT FALSE)
  WITH CHECK (public.is_super_admin() OR is_active IS NOT FALSE);
CREATE POLICY company_active_delete ON public.companies AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (public.is_super_admin() AND is_active IS FALSE);

-- Child tables inherit the same active-workspace rule through their parent.
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
    rule := format(
      'EXISTS (SELECT 1 FROM public.%I parent WHERE parent.id = %I.%I AND public.company_tenant_active_boundary_allows(parent.company_id))',
      r.parent_table, r.child_table, r.child_column);
    EXECUTE format('DROP POLICY IF EXISTS parent_company_active_boundary ON public.%I', r.child_table);
    EXECUTE format(
      'CREATE POLICY parent_company_active_boundary ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (%s) WITH CHECK (%s)',
      r.child_table, rule, rule);
  END LOOP;
END $$;

-- Close the service-role write path for APIs that use the standard wrapper.
CREATE OR REPLACE FUNCTION public.company_write_allowed(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_company_id IS NULL
    OR auth.uid() IS NULL
    OR public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'client')
    OR NOT EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = p_company_id
        AND (
          c.is_active IS FALSE
          OR c.subscription_status::text IN ('suspended', 'cancelled')
          OR (c.subscription_status::text = 'trial' AND c.trial_ends_at IS NOT NULL AND c.trial_ends_at <= now())
        )
    );
$$;
REVOKE ALL ON FUNCTION public.company_write_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_write_allowed(uuid) TO authenticated, service_role;

-- A tenant owner cannot undo a platform owner's workspace decision through
-- a direct update to companies.is_active.
CREATE OR REPLACE FUNCTION public.protect_company_platform_active_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND NEW.deleted_at IS NOT NULL
     AND OLD.is_active IS NOT FALSE THEN
    RAISE EXCEPTION 'Active companies must be deactivated before deletion.' USING ERRCODE = '23514';
  END IF;
  IF auth.role() = 'service_role' OR public.is_super_admin() OR
     (auth.uid() IS NULL AND COALESCE(auth.role(), '') = ''
       AND COALESCE(current_setting('role', true), 'none') IN ('none', 'postgres')) THEN
    RETURN NEW;
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Workspace access and deletion can only be managed by a platform owner' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_company_platform_active_flag() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_company_platform_active_flag ON public.companies;
CREATE TRIGGER protect_company_platform_active_flag
  BEFORE UPDATE OF is_active, deleted_at ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_platform_active_flag();

-- Enforce the deactivate-before-delete rule in the database too, including
-- privileged purge RPCs. A concurrent reactivation makes the DELETE fail.
CREATE OR REPLACE FUNCTION public.prevent_active_company_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_active IS NOT FALSE THEN
    RAISE EXCEPTION 'Active companies must be deactivated before deletion.' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_active_company_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_active_company_delete ON public.companies;
CREATE TRIGGER prevent_active_company_delete
  BEFORE DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_active_company_delete();

COMMIT;
