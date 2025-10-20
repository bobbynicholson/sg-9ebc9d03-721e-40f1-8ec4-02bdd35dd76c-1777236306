-- FINAL FIX: Create a security definer function to get user's company_id without RLS
-- This function runs with elevated privileges and bypasses RLS, preventing recursion

CREATE OR REPLACE FUNCTION get_user_company_id(user_uuid UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- This is key - it runs without RLS checks
AS $$
DECLARE
  result UUID;
BEGIN
  SELECT company_id INTO result
  FROM profiles
  WHERE id = user_uuid
  LIMIT 1;
  
  RETURN result;
END;
$$;

-- Now recreate policies using this function instead of subqueries
DROP POLICY IF EXISTS "view_same_company" ON profiles;
DROP POLICY IF EXISTS "view_own_profile" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;

-- 1. Users can ALWAYS view their own profile
CREATE POLICY "view_own_profile" ON profiles
FOR SELECT
USING (auth.uid() = id);

-- 2. Users can view profiles in the same company (using the function)
CREATE POLICY "view_same_company" ON profiles
FOR SELECT
USING (
  company_id IS NOT NULL 
  AND company_id = get_user_company_id(auth.uid())
);

-- 3. Users can update their own profile
CREATE POLICY "update_own_profile" ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Users can create their own profile
CREATE POLICY "insert_own_profile" ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION get_user_company_id(UUID) TO authenticated;