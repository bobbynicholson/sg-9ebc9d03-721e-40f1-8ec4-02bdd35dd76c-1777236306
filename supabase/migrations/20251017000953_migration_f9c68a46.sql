-- ==================== PHASE 2: ADDITIONAL CRITICAL RLS FIXES ====================

-- ==================== FIX 7: ORDERS TABLE ====================
-- CRITICAL: Ensure orders are properly isolated by company

-- Orders should only be visible to company staff and assigned drivers/chefs
DROP POLICY IF EXISTS "Drivers can view assigned orders" ON orders;
DROP POLICY IF EXISTS "Chefs can view assigned orders" ON orders;

CREATE POLICY "drivers_view_assigned_orders" ON orders
  FOR SELECT
  USING (assigned_driver_id = auth.uid());

CREATE POLICY "chefs_view_assigned_orders" ON orders
  FOR SELECT
  USING (assigned_chef_id = auth.uid());

CREATE POLICY "clients_view_own_orders" ON orders
  FOR SELECT
  USING (client_id = auth.uid());

-- ==================== FIX 8: LEADS TABLE ====================
-- CRITICAL: Ensure leads are company-isolated

-- Add missing super_admin access
CREATE POLICY "super_admin_view_all_leads" ON leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 9: QUOTES TABLE ====================
-- Add super_admin access
CREATE POLICY "super_admin_view_all_quotes" ON quotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 10: INVENTORY TABLE ====================
-- Add super_admin access
CREATE POLICY "super_admin_view_all_inventory" ON inventory
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 11: EQUIPMENT TABLE ====================
-- Add super_admin access
CREATE POLICY "super_admin_view_all_equipment" ON equipment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 12: DRIVER_ASSIGNMENTS TABLE ====================
-- Add super_admin access
CREATE POLICY "super_admin_view_all_driver_assignments" ON driver_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 13: NOTIFICATIONS TABLE ====================
-- Ensure notifications are properly scoped
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can access their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;

CREATE POLICY "system_insert_notifications" ON notifications
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "users_view_own_notifications" ON notifications
  FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "users_update_own_notifications" ON notifications
  FOR UPDATE
  USING (recipient_id = auth.uid());

-- ==================== FIX 14: SHOPPING_LISTS TABLE ====================
-- Add company-level access for shopping team
DROP POLICY IF EXISTS "Shopping team can view assigned lists" ON shopping_lists;

CREATE POLICY "shopping_team_view_assigned_lists" ON shopping_lists
  FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- ==================== FIX 15: KITCHEN TABLES ====================
-- Ensure kitchen_duty_shifts and kitchen_task_completions are company-isolated

-- Add company validation to kitchen_duty_shifts
CREATE POLICY "company_staff_view_duty_shifts" ON kitchen_duty_shifts
  FOR SELECT
  USING (
    staff_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p1
      INNER JOIN profiles p2 ON p2.id = kitchen_duty_shifts.staff_id
      WHERE p1.id = auth.uid()
      AND p1.company_id = p2.company_id
      AND p1.company_id IS NOT NULL
      AND p1.active_role IN ('admin', 'owner', 'kitchen', 'chef')
    )
  );

-- ==================== FIX 16: CLEANING TABLES ====================
-- Ensure cleaning duty logs are properly isolated

DROP POLICY IF EXISTS "Users can view their company duty logs" ON cleaning_duty_logs;

CREATE POLICY "company_staff_view_cleaning_duty_logs" ON cleaning_duty_logs
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- ==================== FIX 17: MENU AND RECIPE TABLES ====================
-- Ensure menu_items and recipes are properly company-isolated

-- Menu items should use profiles.company_id properly
DROP POLICY IF EXISTS "Users can manage their company menu items" ON menu_items;
DROP POLICY IF EXISTS "Users can view their company menu items" ON menu_items;

CREATE POLICY "company_staff_manage_menu_items" ON menu_items
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- Recipes should use company_id properly
DROP POLICY IF EXISTS "Users can manage their company recipes" ON recipes;
DROP POLICY IF EXISTS "Users can view their company recipes" ON recipes;

CREATE POLICY "company_staff_manage_recipes" ON recipes
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- ==================== FIX 18: ENSURE ALL COMPANY TABLES HAVE SUPER_ADMIN ACCESS ====================

-- Add super_admin access to all major operational tables
CREATE POLICY "super_admin_view_all_shopping_lists" ON shopping_lists
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

CREATE POLICY "super_admin_view_all_notifications" ON notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );