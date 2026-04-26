-- Fix the last table: exchange_rates
-- This is global data (not company-specific), so allow read for all authenticated users
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_rates" ON exchange_rates;
CREATE POLICY "authenticated_read_rates" ON exchange_rates
  FOR SELECT USING (auth.role() = 'authenticated');
  
-- Only super admins can modify
DROP POLICY IF EXISTS "super_admin_modify_rates" ON exchange_rates;
CREATE POLICY "super_admin_modify_rates" ON exchange_rates
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'super_admin'
    )
  );