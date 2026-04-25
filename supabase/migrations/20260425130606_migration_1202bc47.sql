-- Continue RLS policies for remaining tables

-- ==============================================================================
-- LEADS table RLS policies
-- ==============================================================================

DROP POLICY IF EXISTS "Users can view leads from their company" ON leads;
DROP POLICY IF EXISTS "Users can insert leads for their company" ON leads;
DROP POLICY IF EXISTS "Users can update leads in their company" ON leads;
DROP POLICY IF EXISTS "Users can delete leads in their company" ON leads;

CREATE POLICY "Users can view leads from their company" ON leads
  FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can insert leads for their company" ON leads
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can update leads in their company" ON leads
  FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can delete leads in their company" ON leads
  FOR DELETE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

-- ==============================================================================
-- CLIENTS table RLS policies
-- ==============================================================================

DROP POLICY IF EXISTS "Users can view clients from their company" ON clients;
DROP POLICY IF EXISTS "Users can insert clients for their company" ON clients;
DROP POLICY IF EXISTS "Users can update clients in their company" ON clients;
DROP POLICY IF EXISTS "Users can delete clients in their company" ON clients;

CREATE POLICY "Users can view clients from their company" ON clients
  FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can insert clients for their company" ON clients
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can update clients in their company" ON clients
  FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can delete clients in their company" ON clients
  FOR DELETE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

-- ==============================================================================
-- INVENTORY_ITEMS table RLS policies
-- ==============================================================================

DROP POLICY IF EXISTS "Users can view inventory from their company" ON inventory_items;
DROP POLICY IF EXISTS "Users can insert inventory for their company" ON inventory_items;
DROP POLICY IF EXISTS "Users can update inventory in their company" ON inventory_items;
DROP POLICY IF EXISTS "Users can delete inventory in their company" ON inventory_items;

CREATE POLICY "Users can view inventory from their company" ON inventory_items
  FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can insert inventory for their company" ON inventory_items
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can update inventory in their company" ON inventory_items
  FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can delete inventory in their company" ON inventory_items
  FOR DELETE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

-- Verify all policies are created
SELECT 
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'quotes', 'leads', 'clients', 'inventory_items')
ORDER BY tablename, cmd;