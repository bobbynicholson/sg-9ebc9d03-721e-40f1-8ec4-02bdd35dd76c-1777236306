-- Drop ALL policies to start fresh
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Same company view" ON profiles;
DROP POLICY IF EXISTS "Admin company management" ON profiles;

-- Create MINIMAL, NON-RECURSIVE policies
-- Policy 1: Users can ALWAYS view, insert, and update their OWN profile (no recursion)
CREATE POLICY "Own profile full access" ON profiles
FOR ALL
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Policy 2: For company staff viewing other profiles in the same company
-- This uses a SAFE approach: store company_id directly in the session JWT
-- and compare against that, avoiding ANY table lookups
CREATE POLICY "Company profiles readable" ON profiles
FOR SELECT
USING (
  -- Allow if it's your own profile
  id = auth.uid()
  OR
  -- Allow if you're in the same company (using JWT claim, not table lookup)
  (
    company_id IS NOT NULL 
    AND company_id = (auth.jwt()->>'company_id')::uuid
  )
);