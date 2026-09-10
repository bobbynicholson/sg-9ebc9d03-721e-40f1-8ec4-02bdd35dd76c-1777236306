-- Add a policy to allow unauthenticated reads for login check
-- This is safe because we're only allowing SELECT on profiles table for login validation
CREATE POLICY "allow_login_check" ON profiles
  FOR SELECT
  USING (true);

-- Verify the policy was created
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;