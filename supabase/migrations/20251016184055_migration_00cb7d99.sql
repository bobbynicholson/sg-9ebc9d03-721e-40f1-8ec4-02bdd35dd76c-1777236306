-- Phase 2: Add company_id to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Create index for company_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);

-- Update the RLS policy on companies to allow staff to view their company
DROP POLICY IF EXISTS "Anyone can view active companies" ON companies;

CREATE POLICY "Company staff can view their company"
  ON companies
  FOR SELECT
  USING (
    owner_id = auth.uid() 
    OR 
    id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() AND company_id IS NOT NULL
    )
  );

COMMENT ON COLUMN profiles.company_id IS 'The company this user belongs to (catering business)';