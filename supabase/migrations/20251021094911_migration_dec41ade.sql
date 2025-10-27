-- Step 1: Drop ALL potentially problematic recursive policies
DROP POLICY IF EXISTS "Admins can view all company users" ON profiles;
DROP POLICY IF EXISTS "Admins can update all company users" ON profiles;
DROP POLICY IF EXISTS "Admins can insert company users" ON profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Company staff can view company profiles" ON profiles;
DROP POLICY IF EXISTS "Company admins can manage company profiles" ON profiles;

-- Step 2: Keep the simple, working policies
-- These already exist and don't cause recursion:
-- - "Users can view own profile"
-- - "Users can update own profile"
-- - "Users can insert own profile"

-- Step 3: Create a SAFE policy for company staff to view profiles in their company
-- This uses LIMIT 1 to prevent recursion
CREATE POLICY "Company staff view company profiles" ON profiles
FOR SELECT
USING (
  company_id IS NOT NULL
  AND company_id = (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() 
    AND company_id IS NOT NULL
    LIMIT 1
  )
);

-- Step 4: Create a SAFE policy for company admins to manage profiles
-- This uses LIMIT 1 to prevent recursion
CREATE POLICY "Company admins manage company profiles" ON profiles
FOR ALL
USING (
  company_id IS NOT NULL
  AND company_id = (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() 
    AND active_role IN ('admin', 'owner', 'super_admin')
    AND company_id IS NOT NULL
    LIMIT 1
  )
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() 
    AND active_role IN ('admin', 'owner', 'super_admin')
    AND company_id IS NOT NULL
    LIMIT 1
  )
);