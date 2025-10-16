-- First, let's check what user is currently authenticated (for debugging)
-- Then create a more permissive policy

-- Drop existing policy
DROP POLICY IF EXISTS "Allow role assignments" ON user_departments;

-- Create a more permissive policy with better conditions
CREATE POLICY "Allow role assignments"
ON user_departments FOR INSERT
WITH CHECK (
  -- Allow if user is authenticated and is an admin/owner
  (
    auth.uid() IS NOT NULL
    AND (
      -- Check profiles table for admin role
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner', 'super_admin')
      )
      OR
      -- Check profiles table for active_role as admin
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.active_role IN ('admin', 'owner', 'super_admin')
      )
      OR
      -- Allow client role self-assignment (for registration)
      department = 'client'
    )
  )
);

-- Also ensure SELECT policy exists for users to see their own roles
DROP POLICY IF EXISTS "Users can view their own roles" ON user_departments;
CREATE POLICY "Users can view their own roles"
ON user_departments FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner', 'super_admin')
  )
);

-- Ensure UPDATE policy exists for admins to update roles
DROP POLICY IF EXISTS "Admins can update roles" ON user_departments;
CREATE POLICY "Admins can update roles"
ON user_departments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner', 'super_admin')
  )
);

-- Ensure DELETE policy exists for admins to remove roles
DROP POLICY IF EXISTS "Admins can delete roles" ON user_departments;
CREATE POLICY "Admins can delete roles"
ON user_departments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner', 'super_admin')
  )
);