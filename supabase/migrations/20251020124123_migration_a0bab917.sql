-- Drop the existing check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the updated constraint that includes 'super_admin'
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role = ANY (ARRAY['admin'::text, 'client'::text, 'driver'::text, 'kitchen'::text, 'cleaning'::text, 'shopping'::text, 'super_admin'::text]));

-- Now update Alex's profile to super_admin
UPDATE profiles 
SET 
  role = 'super_admin',
  active_role = 'super_admin',
  company_id = NULL
WHERE email = 'alex@skylight-digital.co.za';

-- Verify the update
SELECT id, email, role, active_role, company_id, full_name, created_at
FROM profiles 
WHERE email = 'alex@skylight-digital.co.za';