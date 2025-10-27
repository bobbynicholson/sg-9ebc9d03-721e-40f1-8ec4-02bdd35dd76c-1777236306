-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Company staff view company profiles" ON profiles;
DROP POLICY IF EXISTS "Company admins manage company profiles" ON profiles;

-- Create SAFE, NON-RECURSIVE policies
-- Policy 1: Users can always view their own profile (no recursion)
-- This already exists: "Users can view own profile"

-- Policy 2: Users can view profiles in the same company
-- Use a simple comparison without subqueries
CREATE POLICY "Same company view" ON profiles
FOR SELECT
USING (
  -- Either it's your own profile, OR you're in the same company
  id = auth.uid() 
  OR 
  (
    company_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 
      FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'company_id' = profiles.company_id::text
    )
  )
);

-- Policy 3: Admins can manage profiles in their company
-- Use auth.jwt() to get role without querying profiles
CREATE POLICY "Admin company management" ON profiles
FOR ALL
USING (
  -- Either it's your own profile, OR you're an admin in the same company
  id = auth.uid()
  OR
  (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'company_id' = profiles.company_id::text
      AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'owner', 'super_admin')
    )
  )
)
WITH CHECK (
  -- Same check for INSERT/UPDATE
  id = auth.uid()
  OR
  (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'company_id' = profiles.company_id::text
      AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'owner', 'super_admin')
    )
  )
);