-- Wave 45 perf: orders RLS init-plan rewrite
-- Wraps auth.uid() in (SELECT ...) so Postgres caches the call once per query
-- instead of re-evaluating per row. Semantics unchanged.

-- Legacy DELETE policy
DROP POLICY IF EXISTS "Users can delete orders in their company" ON public.orders;
CREATE POLICY "Users can delete orders in their company"
  ON public.orders
  FOR DELETE
  USING (
    (company_id IN (
       SELECT profiles.company_id
       FROM profiles
       WHERE profiles.id = (SELECT auth.uid())
     ))
    OR (EXISTS (
       SELECT 1 FROM profiles
       WHERE profiles.id = (SELECT auth.uid())
         AND profiles.active_role = 'super_admin'
     ))
  );

-- INSERT
DROP POLICY IF EXISTS tenant_isolation_insert_orders ON public.orders;
CREATE POLICY tenant_isolation_insert_orders
  ON public.orders
  FOR INSERT
  WITH CHECK (company_id = get_user_company_id((SELECT auth.uid())));

-- SELECT
DROP POLICY IF EXISTS tenant_isolation_select_orders ON public.orders;
CREATE POLICY tenant_isolation_select_orders
  ON public.orders
  FOR SELECT
  USING (
    (EXISTS (
       SELECT 1 FROM profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.company_id = orders.company_id
         AND p.role <> 'client'::user_role
     ))
    OR (client_id IN (
       SELECT clients.id FROM clients
       WHERE clients.user_id = (SELECT auth.uid())
     ))
    OR (EXISTS (
       SELECT 1 FROM profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.role = 'client'::user_role
         AND p.company_id = orders.company_id
         AND lower(p.email) = lower(orders.client_email)
     ))
    OR is_super_admin()
  );

-- UPDATE
DROP POLICY IF EXISTS tenant_isolation_update_orders ON public.orders;
CREATE POLICY tenant_isolation_update_orders
  ON public.orders
  FOR UPDATE
  USING (company_id = get_user_company_id((SELECT auth.uid())));

-- region_scope_* are RESTRICTIVE; rewrite is fine but no auth.uid() inside
-- user_can_access_region (function call only) so no init-plan benefit. Leave them.
