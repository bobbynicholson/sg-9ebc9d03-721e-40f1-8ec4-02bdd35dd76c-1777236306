-- CLEAN SLATE: Drop ALL existing policies on user_departments
DROP POLICY IF EXISTS "Admins can delete departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_departments;
DROP POLICY IF EXISTS "Allow role assignments" ON user_departments;
DROP POLICY IF EXISTS "Admins can view all departments" ON user_departments;
DROP POLICY IF EXISTS "Users can view their own departments" ON user_departments;
DROP POLICY IF EXISTS "Users can view their own roles" ON user_departments;
DROP POLICY IF EXISTS "Admins can update departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can update roles" ON user_departments;

-- CREATE SIMPLE, COMPREHENSIVE POLICIES

-- 1. INSERT POLICY: Allow admins to assign any role, users to self-assign client
CREATE POLICY "user_departments_insert_policy" ON user_departments
FOR INSERT
WITH CHECK (
  -- Allow if user is an admin/owner/super_admin
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
  OR
  -- Allow users to self-assign 'client' role only
  (auth.uid() = user_id AND department = 'client')
);

-- 2. SELECT POLICY: Users can see their own roles, admins can see all
CREATE POLICY "user_departments_select_policy" ON user_departments
FOR SELECT
USING (
  -- Users can see their own roles
  auth.uid() = user_id
  OR
  -- Admins can see all roles
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
);

-- 3. UPDATE POLICY: Only admins can update roles
CREATE POLICY "user_departments_update_policy" ON user_departments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
);

-- 4. DELETE POLICY: Only admins can delete roles
CREATE POLICY "user_departments_delete_policy" ON user_departments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
);

-- Verify the new policies
SELECT 
  policyname,
  cmd AS command,
  CASE 
    WHEN cmd = 'INSERT' THEN with_check
    ELSE qual
  END AS condition
FROM pg_policies
WHERE tablename = 'user_departments'
ORDER BY cmd, policyname;