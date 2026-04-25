-- Create RLS policies to enforce company data isolation at database level
-- This is the CRITICAL security layer - even if code has bugs, DB prevents leaks

-- ORDERS TABLE - Company Isolation
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their company's orders" ON orders;
CREATE POLICY "Users can only see their company's orders" ON orders
FOR SELECT USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  -- Super admin can see all
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "Users can only insert orders for their company" ON orders;
CREATE POLICY "Users can only insert orders for their company" ON orders
FOR INSERT WITH CHECK (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "Users can only update their company's orders" ON orders;
CREATE POLICY "Users can only update their company's orders" ON orders
FOR UPDATE USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

-- CLIENTS TABLE - Company Isolation
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their company's clients" ON clients;
CREATE POLICY "Users can only see their company's clients" ON clients
FOR SELECT USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "Users can only insert clients for their company" ON clients;
CREATE POLICY "Users can only insert clients for their company" ON clients
FOR INSERT WITH CHECK (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

-- INVENTORY_ITEMS TABLE - Company Isolation
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their company's inventory" ON inventory_items;
CREATE POLICY "Users can only see their company's inventory" ON inventory_items
FOR SELECT USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "Users can only manage their company's inventory" ON inventory_items;
CREATE POLICY "Users can only manage their company's inventory" ON inventory_items
FOR ALL USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

-- EQUIPMENT_INVENTORY TABLE - Company Isolation
ALTER TABLE equipment_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their company's equipment" ON equipment_inventory;
CREATE POLICY "Users can only see their company's equipment" ON equipment_inventory
FOR SELECT USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "Users can only manage their company's equipment" ON equipment_inventory;
CREATE POLICY "Users can only manage their company's equipment" ON equipment_inventory
FOR ALL USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
  )
);

-- Verify RLS is enabled on critical tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('orders', 'clients', 'inventory_items', 'equipment_inventory', 'quotes', 'leads', 'profiles')
ORDER BY tablename;