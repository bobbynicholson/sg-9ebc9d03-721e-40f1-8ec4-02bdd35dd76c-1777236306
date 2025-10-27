-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Admins can view all company users" ON profiles;
DROP POLICY IF EXISTS "Admins can update all company users" ON profiles;
DROP POLICY IF EXISTS "Admins can insert company users" ON profiles;

-- Recreate them with non-recursive logic
-- Allow admins to view users in their company (check active_role directly without recursion)
CREATE POLICY "Admins can view all company users" ON profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.active_role IN ('admin', 'owner', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.company_id IS NOT NULL
  )
);

-- Allow admins to update users in their company
CREATE POLICY "Admins can update all company users" ON profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.active_role IN ('admin', 'owner', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.company_id IS NOT NULL
  )
);

-- Allow admins to insert users for their company
CREATE POLICY "Admins can insert company users" ON profiles
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.active_role IN ('admin', 'owner', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.company_id IS NOT NULL
  )
);