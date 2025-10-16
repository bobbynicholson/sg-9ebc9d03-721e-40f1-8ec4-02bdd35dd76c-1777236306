-- Drop the existing insert policy
DROP POLICY IF EXISTS user_departments_insert_policy ON user_departments;

-- Create a new, corrected insert policy
CREATE POLICY user_departments_insert_policy ON user_departments
FOR INSERT
WITH CHECK (
  -- Allow if the inserter is an admin/owner/super_admin
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role = ANY(ARRAY['admin', 'owner', 'super_admin'])
        OR profiles.active_role = ANY(ARRAY['admin', 'owner', 'super_admin'])
      )
  )
  OR
  -- Allow users to self-register as client
  (auth.uid() = user_id AND department = 'client')
);

-- Verify the new policy
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  with_check
FROM pg_policies
WHERE tablename = 'user_departments'
  AND policyname = 'user_departments_insert_policy';