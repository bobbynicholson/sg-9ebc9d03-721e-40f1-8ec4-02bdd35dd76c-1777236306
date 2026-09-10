-- BATCH 4: INVENTORY & SHOPPING TABLES

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_inventory" ON inventory FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_inventory_transactions" ON inventory_transactions FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_shopping_lists" ON shopping_lists FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_suppliers" ON suppliers FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_storage_locations" ON storage_locations FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE storage_racks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_storage_racks" ON storage_racks FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE temperature_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_temperature_logs" ON temperature_logs FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE ice_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_ice_tracking" ON ice_tracking FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE linen_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_linen_inventory" ON linen_inventory FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE glassware_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_glassware_catalog" ON glassware_catalog FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE utensil_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_utensil_tracking" ON utensil_tracking FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 4: Inventory & shopping tables protected (11 tables)' as status;