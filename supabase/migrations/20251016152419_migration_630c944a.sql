-- Drop existing admin policies
DROP POLICY IF EXISTS "Admins can assign departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can remove departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can update departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can view all user departments" ON user_departments;

-- Create new policies that check BOTH role and active_role
CREATE POLICY "Admins can view all departments"
ON user_departments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

CREATE POLICY "Admins can assign departments"
ON user_departments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

CREATE POLICY "Admins can update departments"
ON user_departments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

CREATE POLICY "Admins can delete departments"
ON user_departments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

-- Also add policy for users to view their own departments
CREATE POLICY "Users can view their own departments"
ON user_departments FOR SELECT
USING (user_id = auth.uid());