-- CRITICAL SECURITY: Row-Level Security Policies for Multi-Tenant Data Isolation
-- This ensures companies can ONLY access their own data at the database level

-- ==============================================================================
-- STEP 1: Enable RLS on all company-owned tables
-- ==============================================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE optimized_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- STEP 2: Create RLS policies for ORDERS table
-- ==============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view orders from their company" ON orders;
DROP POLICY IF EXISTS "Users can insert orders for their company" ON orders;
DROP POLICY IF EXISTS "Users can update orders in their company" ON orders;
DROP POLICY IF EXISTS "Users can delete orders in their company" ON orders;

-- SELECT: Users can only view orders from their own company
CREATE POLICY "Users can view orders from their company" ON orders
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    OR
    -- Super admins can see all companies
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
    )
  );

-- INSERT: Users can only create orders for their company
CREATE POLICY "Users can insert orders for their company" ON orders
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
    )
  );

-- UPDATE: Users can only update orders in their company
CREATE POLICY "Users can update orders in their company" ON orders
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
    )
  );

-- DELETE: Users can only delete orders in their company
CREATE POLICY "Users can delete orders in their company" ON orders
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin'
    )
  );

-- ==============================================================================
-- STEP 3: Create RLS policies for QUOTES table
-- ==============================================================================

DROP POLICY IF EXISTS "Users can view quotes from their company" ON quotes;
DROP POLICY IF EXISTS "Users can insert quotes for their company" ON quotes;
DROP POLICY IF EXISTS "Users can update quotes in their company" ON quotes;
DROP POLICY IF EXISTS "Users can delete quotes in their company" ON quotes;

CREATE POLICY "Users can view quotes from their company" ON quotes
  FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can insert quotes for their company" ON quotes
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can update quotes in their company" ON quotes
  FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

CREATE POLICY "Users can delete quotes in their company" ON quotes
  FOR DELETE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

-- ==============================================================================
-- Verify RLS is enabled
-- ==============================================================================

SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'quotes', 'leads', 'clients', 'inventory_items', 'equipment_inventory')
ORDER BY tablename;