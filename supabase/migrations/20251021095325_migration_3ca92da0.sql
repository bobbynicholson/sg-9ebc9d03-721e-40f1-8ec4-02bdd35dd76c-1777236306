-- Re-enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "profiles_own_access" ON profiles;

-- Create SAFE, NON-RECURSIVE policies

-- Policy 1: Users can ALWAYS access their own profile (100% safe - no recursion)
CREATE POLICY "profiles_own_full_access" ON profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 2: For service role (backend operations like triggers) - bypass RLS
-- This allows the auth trigger to create profiles without hitting RLS checks
CREATE POLICY "profiles_service_role_access" ON profiles
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Policy 3: For authenticated users to view profiles in their company
-- This uses a security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;

-- Now create the company-wide read policy using the function
CREATE POLICY "profiles_company_read_access" ON profiles
FOR SELECT
USING (
  -- Own profile is always readable
  auth.uid() = id
  OR
  -- Or you can read profiles in your company
  (
    company_id IS NOT NULL
    AND company_id = public.get_user_company_id()
  )
);