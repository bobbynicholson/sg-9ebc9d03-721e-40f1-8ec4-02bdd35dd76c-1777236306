-- Step 3: Create ONE SIMPLE policy for profiles that allows ANYONE to SELECT
-- This is necessary for login to work
CREATE POLICY "public_select_for_login" ON profiles
  FOR SELECT
  USING (true);

-- Verify the policy was created
SELECT policyname, cmd, qual::text
FROM pg_policies
WHERE tablename = 'profiles';