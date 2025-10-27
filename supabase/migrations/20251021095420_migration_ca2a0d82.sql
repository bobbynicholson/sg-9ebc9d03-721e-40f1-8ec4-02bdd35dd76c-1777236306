-- Drop ALL existing policies and functions
DROP POLICY IF EXISTS "profiles_own_full_access" ON profiles;
DROP POLICY IF EXISTS "profiles_service_role_access" ON profiles;
DROP POLICY IF EXISTS "profiles_company_read_access" ON profiles;
DROP FUNCTION IF EXISTS public.get_user_company_id();

-- Create the SIMPLEST possible RLS policies that cannot cause recursion
-- These policies ONLY use auth.uid() and NEVER query any tables

-- Policy 1: Users can do EVERYTHING with their own profile (100% safe)
CREATE POLICY "profiles_self_access" ON profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 2: Service role bypass (for triggers and backend operations)
CREATE POLICY "profiles_service_bypass" ON profiles
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- That's it! No company-wide access policies that could cause recursion.
-- Company-wide access will be handled in the application layer, not RLS.