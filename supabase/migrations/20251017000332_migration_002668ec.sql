-- ============================================
-- PHASE 1: FIX CRITICAL RLS POLICIES
-- ============================================

-- 1. FIX PROFILES TABLE - Company-Scoped Access
-- Current issue: Everyone can view all profiles (too permissive)

-- Drop overly permissive policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

-- Create proper company-scoped policies
CREATE POLICY "users_view_own_profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_view_company_profiles"
  ON profiles FOR SELECT
  USING (
    company_id IS NOT NULL 
    AND company_id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- 2. FIX USER_DEPARTMENTS - Add Company-Scoped Access
-- Current issue: Policies check roles but don't validate company context

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "user_departments_insert_policy" ON user_departments;
DROP POLICY IF EXISTS "user_departments_update_policy" ON user_departments;
DROP POLICY IF EXISTS "user_departments_delete_policy" ON user_departments;
DROP POLICY IF EXISTS "user_departments_select_policy" ON user_departments;

-- Create unified company-aware policies
CREATE POLICY "company_admins_manage_departments"
  ON user_departments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = (SELECT company_id FROM profiles WHERE id = user_departments.user_id)
      AND p.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = (SELECT company_id FROM profiles WHERE id = user_departments.user_id)
      AND p.active_role IN ('admin', 'owner', 'super_admin')
    )
  );

CREATE POLICY "users_view_own_departments"
  ON user_departments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_self_register_as_client"
  ON user_departments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND department = 'client'
  );

-- 3. FIX COMPANIES TABLE - Improve Staff Access
-- Current issue: Staff policies exist but need company_id validation

-- Add policy for staff to update company details
CREATE POLICY "staff_update_own_company"
  ON companies FOR UPDATE
  USING (
    id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
      AND active_role IN ('admin', 'owner')
    )
  );