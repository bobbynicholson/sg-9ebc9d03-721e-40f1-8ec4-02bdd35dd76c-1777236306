-- BATCH 1: EQUIPMENT TABLES
-- Enable RLS and add company isolation policies

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment" ON equipment FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment_assignments" ON equipment_assignments FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment_bookings" ON equipment_bookings FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_cleaning_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment_cleaning" ON equipment_cleaning_status FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_damages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment_damages" ON equipment_damages FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment_kits" ON equipment_kits FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_kit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment_kit_items" ON equipment_kit_items FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment_maintenance" ON equipment_maintenance FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_shortages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_equipment_shortages" ON equipment_shortages FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_shortage_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_shortage_flags" ON equipment_shortage_flags FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE equipment_shortage_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_shortage_reports" ON equipment_shortage_reports FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 1: Equipment tables protected (11 tables)' as status;