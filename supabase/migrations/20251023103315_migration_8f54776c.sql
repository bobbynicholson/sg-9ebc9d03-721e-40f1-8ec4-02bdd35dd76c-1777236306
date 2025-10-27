-- Drop ALL existing problematic policies and functions
DROP POLICY IF EXISTS "profiles_self_access" ON profiles;
DROP POLICY IF EXISTS "profiles_service_bypass" ON profiles;
DROP POLICY IF EXISTS "profiles_own_full_access" ON profiles;
DROP POLICY IF EXISTS "profiles_service_role_access" ON profiles;
DROP POLICY IF EXISTS "profiles_company_read_access" ON profiles;
DROP FUNCTION IF EXISTS public.get_user_company_id();

-- Create the ABSOLUTE SIMPLEST policies that cannot cause recursion
-- These policies use ONLY auth.uid() and auth.role() - no table queries

-- Policy 1: Users can access their own profile (100% safe - no recursion possible)
CREATE POLICY "users_own_profile_access" 
ON profiles 
FOR ALL 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 2: Service role can access all profiles (for triggers and backend)
CREATE POLICY "service_role_full_access" 
ON profiles 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- That's it! No company-wide policies that could cause recursion.
-- Company access will be handled at the application layer with WHERE clauses.