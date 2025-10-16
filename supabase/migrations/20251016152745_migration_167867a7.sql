-- Drop the existing policy and create a more comprehensive one
DROP POLICY IF EXISTS "Allow role assignments" ON user_departments;

-- Create a comprehensive INSERT policy that checks multiple admin scenarios
CREATE POLICY "Allow role assignments"
ON user_departments FOR INSERT
WITH CHECK (
  -- Scenario 1: User is admin/owner in profiles table
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
  OR
  -- Scenario 2: User has admin role in user_departments table
  EXISTS (
    SELECT 1 FROM user_departments ud
    WHERE ud.user_id = auth.uid()
    AND ud.department IN ('admin', 'owner', 'super_admin')
  )
  OR
  -- Scenario 3: Allow client role assignment during registration (first-time setup)
  (department = 'client' AND auth.uid() IS NOT NULL)
);