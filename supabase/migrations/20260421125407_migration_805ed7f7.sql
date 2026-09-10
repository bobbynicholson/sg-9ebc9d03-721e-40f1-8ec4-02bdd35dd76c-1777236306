-- TENANT ISOLATION POLICIES (LEADS)
DROP POLICY IF EXISTS "tenant_isolation_select_leads" ON public.leads;
CREATE POLICY "tenant_isolation_select_leads" ON public.leads
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_isolation_insert_leads" ON public.leads;
CREATE POLICY "tenant_isolation_insert_leads" ON public.leads
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_isolation_update_leads" ON public.leads;
CREATE POLICY "tenant_isolation_update_leads" ON public.leads
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "admin_delete_leads" ON public.leads;
CREATE POLICY "admin_delete_leads" ON public.leads
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- CLIENTS TABLE POLICIES
DROP POLICY IF EXISTS "tenant_isolation_select_clients" ON public.clients;
CREATE POLICY "tenant_isolation_select_clients" ON public.clients
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS "tenant_isolation_insert_clients" ON public.clients;
CREATE POLICY "tenant_isolation_insert_clients" ON public.clients
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_isolation_update_clients" ON public.clients;
CREATE POLICY "tenant_isolation_update_clients" ON public.clients
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- ORDERS TABLE POLICIES
DROP POLICY IF EXISTS "tenant_isolation_select_orders" ON public.orders;
CREATE POLICY "tenant_isolation_select_orders" ON public.orders
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    OR client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tenant_isolation_insert_orders" ON public.orders;
CREATE POLICY "tenant_isolation_insert_orders" ON public.orders
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_isolation_update_orders" ON public.orders;
CREATE POLICY "tenant_isolation_update_orders" ON public.orders
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));