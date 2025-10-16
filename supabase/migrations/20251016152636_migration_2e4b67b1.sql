-- Drop the conflicting policies and create one comprehensive policy
DROP POLICY IF EXISTS "Admins can assign departments" ON user_departments;
DROP POLICY IF EXISTS "Allow initial role assignment" ON user_departments;

-- Create a single comprehensive INSERT policy
CREATE POLICY "Allow role assignments"
ON user_departments FOR INSERT
WITH CHECK (
  -- Allow if user is admin (for any role assignment)
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin' OR profiles.role = 'owner' OR profiles.active_role = 'owner')
  )
  OR
  -- Allow client role assignment during registration (when no auth.uid() yet)
  (department = 'client' AND auth.uid() IS NULL)
  OR
  -- Allow self-assignment of client role during first login
  (department = 'client' AND user_id = auth.uid())
);