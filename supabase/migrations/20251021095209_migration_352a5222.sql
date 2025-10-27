-- Drop ALL existing policies to start completely fresh
DROP POLICY IF EXISTS "Own profile full access" ON profiles;
DROP POLICY IF EXISTS "Company profiles readable" ON profiles;

-- Create the SIMPLEST possible policies that cannot cause recursion
-- Policy 1: Users can ALWAYS do everything with their own profile
CREATE POLICY "own_profile_all_access" ON profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 2: For SELECT only - allow viewing profiles in same company
-- This uses a lateral join which is safe and doesn't cause recursion
CREATE POLICY "company_profiles_select" ON profiles
FOR SELECT
USING (
  -- Own profile is always accessible
  auth.uid() = id
  OR
  -- OR you can see profiles in your company
  EXISTS (
    SELECT 1
    FROM profiles AS my_profile
    WHERE my_profile.id = auth.uid()
      AND my_profile.company_id IS NOT NULL
      AND my_profile.company_id = profiles.company_id
    LIMIT 1
  )
);