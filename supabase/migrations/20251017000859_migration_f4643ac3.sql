-- ==================== CRITICAL RLS POLICY FIXES ====================
-- This script fixes all Row-Level Security policies to ensure proper data isolation
-- between companies and prevent data leakage

-- ==================== FIX 1: USER_DEPARTMENTS TABLE ====================
-- CRITICAL: The current RLS policies allow company admins to manage ANY user's departments
-- if they're in the same company. This is correct, but we need to ensure proper checks.

-- Drop existing problematic policies
DROP POLICY IF EXISTS "company_admins_manage_departments" ON user_departments;
DROP POLICY IF EXISTS "users_self_register_as_client" ON user_departments;
DROP POLICY IF EXISTS "users_view_own_departments" ON user_departments;

-- Create proper policies with company_id validation
CREATE POLICY "users_view_own_departments" ON user_departments
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users_self_register_as_client" ON user_departments
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() 
    AND department = 'client'
  );

CREATE POLICY "company_admins_manage_departments" ON user_departments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p1
      WHERE p1.id = auth.uid()
      AND p1.company_id IS NOT NULL
      AND p1.active_role IN ('admin', 'owner', 'super_admin')
      AND p1.company_id = (
        SELECT p2.company_id FROM profiles p2 WHERE p2.id = user_departments.user_id
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p1
      WHERE p1.id = auth.uid()
      AND p1.company_id IS NOT NULL
      AND p1.active_role IN ('admin', 'owner', 'super_admin')
      AND p1.company_id = (
        SELECT p2.company_id FROM profiles p2 WHERE p2.id = user_departments.user_id
      )
    )
  );

-- ==================== FIX 2: PROFILES TABLE ====================
-- CRITICAL: Ensure users can only see profiles within their company

DROP POLICY IF EXISTS "users_view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "Enable profile creation for new users" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create proper policies
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users_view_company_profiles" ON profiles
  FOR SELECT
  USING (
    company_id IS NOT NULL 
    AND company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

CREATE POLICY "users_create_own_profile" ON profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid());

-- ==================== FIX 3: COMPANIES TABLE ====================
-- CRITICAL: Ensure proper company isolation

DROP POLICY IF EXISTS "Company owners can manage their company" ON companies;
DROP POLICY IF EXISTS "owners_update_company" ON companies;
DROP POLICY IF EXISTS "owners_view_own_company" ON companies;
DROP POLICY IF EXISTS "staff_update_own_company" ON companies;
DROP POLICY IF EXISTS "staff_view_company" ON companies;
DROP POLICY IF EXISTS "users_create_own_company" ON companies;

-- Create proper policies
CREATE POLICY "company_owners_view" ON companies
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

CREATE POLICY "company_owners_create" ON companies
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "company_admins_update" ON companies
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL 
      AND active_role IN ('admin', 'owner')
    )
  );

-- ==================== FIX 4: TRIAL_EXPIRY_NOTIFICATIONS TABLE ====================
-- CRITICAL: Ensure only company admins and system can access

DROP POLICY IF EXISTS "company_owners_view_trial_notifications" ON trial_expiry_notifications;
DROP POLICY IF EXISTS "company_owners_update_trial_notifications" ON trial_expiry_notifications;
DROP POLICY IF EXISTS "system_insert_trial_notifications" ON trial_expiry_notifications;

CREATE POLICY "system_insert_trial_notifications" ON trial_expiry_notifications
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "company_admins_view_trial_notifications" ON trial_expiry_notifications
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL 
      AND active_role IN ('admin', 'owner')
    )
  );

CREATE POLICY "company_admins_update_trial_notifications" ON trial_expiry_notifications
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL 
      AND active_role IN ('admin', 'owner')
    )
  );

-- ==================== FIX 5: SUPER_ADMIN ACCESS ====================
-- CRITICAL: Add super_admin bypass for platform management

-- Super admins can view all companies
CREATE POLICY "super_admin_view_all_companies" ON companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- Super admins can view all profiles
CREATE POLICY "super_admin_view_all_profiles" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() 
      AND p.active_role = 'super_admin'
    )
  );

-- Super admins can view all trial notifications
CREATE POLICY "super_admin_view_all_trial_notifications" ON trial_expiry_notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 6: SUBSCRIPTIONS TABLE ====================
-- CRITICAL: Ensure subscriptions are properly isolated

-- Users should only see their own subscriptions, not other company users' subscriptions
DROP POLICY IF EXISTS "Users can view their own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON subscriptions;

CREATE POLICY "users_view_own_subscriptions" ON subscriptions
  FOR SELECT
  USING (user_id = auth.uid());