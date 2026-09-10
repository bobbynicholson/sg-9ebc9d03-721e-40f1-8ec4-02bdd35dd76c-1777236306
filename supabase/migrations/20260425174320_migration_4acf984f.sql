-- BATCH 2: DELIVERY & DRIVER TABLES

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_deliveries" ON deliveries FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE delivery_crates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_delivery_crates" ON delivery_crates FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE driver_replacements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_driver_replacements" ON driver_replacements FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE driver_replacement_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_driver_replacement_requests" ON driver_replacement_requests FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE driver_rest_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_driver_rest_logs" ON driver_rest_logs FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_vehicles" ON vehicles FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE vehicle_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_vehicle_logs" ON vehicle_logs FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_vehicle_maintenance" ON vehicle_maintenance FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE load_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_load_plans" ON load_plans FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE loadoff_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_loadoff_verifications" ON loadoff_verifications FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE return_load_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_return_load_tracking" ON return_load_tracking FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 2: Delivery & driver tables protected (11 tables)' as status;