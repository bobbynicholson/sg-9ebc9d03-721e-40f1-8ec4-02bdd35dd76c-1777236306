-- Add policy to allow users to be assigned their first role during registration
-- This is needed when new users are created by the system
CREATE POLICY "Allow initial role assignment"
ON user_departments FOR INSERT
WITH CHECK (
  -- Allow if assigning 'client' role as initial default
  department = 'client'
  OR
  -- Allow if admin is assigning
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

-- Also ensure service role can always assign roles (for system operations)
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;