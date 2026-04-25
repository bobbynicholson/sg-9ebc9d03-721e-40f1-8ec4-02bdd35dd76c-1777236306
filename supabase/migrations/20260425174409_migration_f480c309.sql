-- BATCH 6: STAFF & HR TABLES

ALTER TABLE time_clock_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_time_clock" ON time_clock_entries FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_staff_invitations" ON staff_invitations FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE staff_payment_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_staff_payment" ON staff_payment_ledger FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_training" ON training_materials FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE health_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_health_certificates" ON health_certificates FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 6: Staff & HR tables protected (5 tables)' as status;