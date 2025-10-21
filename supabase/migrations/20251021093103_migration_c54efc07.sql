-- Add RLS policies to allow admins and super_admins to view and manage all users in their company

-- Allow admins to view all users in their company
CREATE POLICY "Admins can view all company users" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role IN ('admin', 'super_admin')
      AND admin_profile.company_id = profiles.company_id
    )
  );

-- Allow admins to update all users in their company
CREATE POLICY "Admins can update all company users" ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role IN ('admin', 'super_admin')
      AND admin_profile.company_id = profiles.company_id
    )
  );

-- Allow admins to insert users in their company (for user creation)
CREATE POLICY "Admins can insert company users" ON profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles AS admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role IN ('admin', 'super_admin')
      AND admin_profile.company_id = profiles.company_id
    )
  );