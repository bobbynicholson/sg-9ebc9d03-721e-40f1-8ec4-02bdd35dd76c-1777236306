-- Drop the conflicting company_admin_view_staff policy
-- This policy blocks company admins from seeing profiles outside their company
-- which interferes with login
DROP POLICY IF EXISTS "company_admin_view_staff" ON profiles;

-- Verify only the public_select_for_login policy remains for SELECT
SELECT policyname, cmd, qual::text
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'SELECT'
ORDER BY policyname;