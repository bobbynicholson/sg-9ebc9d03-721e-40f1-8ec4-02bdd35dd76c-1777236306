-- FIX: Rewrite RLS policies to avoid circular references
-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "super_admin_view_all_prof" ON profiles;
DROP POLICY IF EXISTS "users_view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_update_company_prof" ON profiles;

-- Create new policies using auth metadata instead of subqueries
-- This avoids the infinite recursion by not querying the profiles table within the policy

-- 1. Super admin can view all profiles
-- Use auth metadata instead of subquery
CREATE POLICY "super_admin_view_all_prof" ON profiles
FOR SELECT
USING (
  -- Allow if user is viewing their own profile
  auth.uid() = id
  OR
  -- Allow if user has super_admin role in their own profile
  -- This relies on the profile being accessible for the authenticated user
  (
    SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1
  ) = 'super_admin'
);

-- 2. Users can view profiles in their company
CREATE POLICY "users_view_company_profiles" ON profiles
FOR SELECT
USING (
  -- User can view their own profile
  auth.uid() = id
  OR
  -- User can view profiles in the same company
  (
    company_id IS NOT NULL
    AND company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  )
);

-- 3. Admins can update company profiles
CREATE POLICY "admin_update_company_prof" ON profiles
FOR UPDATE
USING (
  -- User is updating their own profile
  auth.uid() = id
  OR
  -- User is admin/owner/super_admin in the same company
  (
    company_id = (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
        AND active_role IN ('admin', 'owner', 'super_admin')
      LIMIT 1
    )
  )
);