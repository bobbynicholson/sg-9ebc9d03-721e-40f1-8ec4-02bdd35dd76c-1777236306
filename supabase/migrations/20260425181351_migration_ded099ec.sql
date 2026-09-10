-- Drop the users_own_profile policy to avoid conflicts
DROP POLICY IF EXISTS "users_own_profile" ON profiles;

-- Verify only public_select_for_login remains
SELECT policyname, cmd, qual::text as policy_rule
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;