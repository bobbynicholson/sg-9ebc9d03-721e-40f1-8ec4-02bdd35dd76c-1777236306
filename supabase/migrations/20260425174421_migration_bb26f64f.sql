-- BATCH 7: SAFETY, COMPLIANCE & OPERATIONS TABLES

ALTER TABLE safety_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_safety_checks" ON safety_checks FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE safety_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_safety_equipment" ON safety_equipment FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE floor_safety_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_floor_safety" ON floor_safety_inspections FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE lighting_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_lighting_tests" ON lighting_tests FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE pat_testing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_pat_testing" ON pat_testing FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE pest_control_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_pest_control" ON pest_control_logs FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE backup_generators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_backup_generators" ON backup_generators FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE fuel_stockpile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_fuel_stockpile" ON fuel_stockpile FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_insurance" ON insurance_policies FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 7: Safety & compliance tables protected (9 tables)' as status;