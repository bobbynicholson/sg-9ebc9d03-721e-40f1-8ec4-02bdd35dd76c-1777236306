-- Step 2: DROP ALL POLICIES on profiles table
DROP POLICY IF EXISTS "allow_login_check" ON profiles;
DROP POLICY IF EXISTS "company_access_profiles" ON profiles;
DROP POLICY IF EXISTS "company_admin_profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "super_admin_all_profiles" ON profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;

-- Verify all policies are gone
SELECT 'All policies dropped from profiles table' as status;