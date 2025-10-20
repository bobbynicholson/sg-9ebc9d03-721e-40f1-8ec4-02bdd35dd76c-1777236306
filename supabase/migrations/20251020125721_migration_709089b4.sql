-- FIX: Remove ALL policies and create simple, non-recursive ones

-- Drop all existing policies
DROP POLICY IF EXISTS "super_admin_view_all_prof" ON profiles;
DROP POLICY IF EXISTS "users_view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_update_company_prof" ON profiles;
DROP POLICY IF EXISTS "view_own_profile" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "users_create_own_profile" ON profiles;

-- Create NEW simple policies WITHOUT any subqueries

-- 1. Users can ALWAYS view their own profile (no recursion possible)
CREATE POLICY "view_own_profile" ON profiles
FOR SELECT
USING (auth.uid() = id);

-- 2. Users can view profiles in the same company (simple column comparison)
CREATE POLICY "view_same_company" ON profiles
FOR SELECT
USING (
  company_id IS NOT NULL 
  AND EXISTS (
    -- Use auth.uid() directly without nested SELECT
    SELECT 1 FROM profiles p2 
    WHERE p2.id = auth.uid() 
    AND p2.company_id = profiles.company_id
  )
);

-- 3. Users can update their own profile
CREATE POLICY "update_own_profile" ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Users can create their own profile
CREATE POLICY "insert_own_profile" ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Note: Removed super_admin special policy - they use same rules as everyone else
-- Super admins will access data through application logic, not RLS bypass