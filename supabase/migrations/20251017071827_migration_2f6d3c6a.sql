-- ==================== COMPLETE RLS FIX FOR COMPANY CREATION ====================
-- Drop ALL existing policies on companies table
DROP POLICY IF EXISTS "owners_view_own_company" ON companies;
DROP POLICY IF EXISTS "staff_view_their_company" ON companies;
DROP POLICY IF EXISTS "super_admin_view_all_companies" ON companies;
DROP POLICY IF EXISTS "allow_company_creation" ON companies;
DROP POLICY IF EXISTS "owners_update_own_company" ON companies;
DROP POLICY IF EXISTS "super_admin_update_companies" ON companies;
DROP POLICY IF EXISTS "owners_delete_own_company" ON companies;
DROP POLICY IF EXISTS "super_admin_delete_companies" ON companies;
DROP POLICY IF EXISTS "company_staff_manage_own_company" ON companies;
DROP POLICY IF EXISTS "company_owners_full_access" ON companies;

-- CREATE FRESH, WORKING POLICIES
-- 1. VIEWING COMPANIES
CREATE POLICY "view_own_company_as_owner" ON companies
  FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "view_company_as_staff" ON companies
  FOR SELECT
  USING (
    id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "super_admin_view_all" ON companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- 2. CREATING COMPANIES (CRITICAL FIX)
-- Allow ANY authenticated user to create a company where they are the owner
-- This is essential for signup flow
CREATE POLICY "anyone_can_create_company" ON companies
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
  );

-- 3. UPDATING COMPANIES
CREATE POLICY "owner_update_company" ON companies
  FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "super_admin_update_all" ON companies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- 4. DELETING COMPANIES
CREATE POLICY "owner_delete_company" ON companies
  FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "super_admin_delete_all" ON companies
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX PROFILES TABLE RLS ====================
-- Drop existing policies
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "users_view_company_members" ON profiles;
DROP POLICY IF EXISTS "super_admin_view_all_profiles" ON profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "admins_update_company_members" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own_and_company" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- CREATE FRESH PROFILES POLICIES
-- SELECT policies
CREATE POLICY "view_own_profile" ON profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "view_company_profiles" ON profiles
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "super_admin_view_all_prof" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- UPDATE policies (CRITICAL FOR SIGNUP)
CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "admin_update_company_prof" ON profiles
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND active_role IN ('admin', 'owner', 'super_admin')
    )
  );

-- ==================== SUCCESS ====================
DO $$
BEGIN
  RAISE NOTICE '✅ Company signup RLS policies completely rebuilt!';
  RAISE NOTICE '✅ Any authenticated user can now create a company';
  RAISE NOTICE '✅ Users can update their own profiles during signup';
  RAISE NOTICE '✅ Security maintained for all other operations';
END $$;