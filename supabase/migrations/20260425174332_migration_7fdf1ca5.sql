-- BATCH 3: CLEANING & KITCHEN TABLES

ALTER TABLE cleaning_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_cleaning_schedules" ON cleaning_schedules FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE cleaning_supplies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_cleaning_supplies" ON cleaning_supplies FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE cleaning_duty_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_cleaning_duty_logs" ON cleaning_duty_logs FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE kitchen_duty_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_kitchen_duty_shifts" ON kitchen_duty_shifts FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE daily_prep_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_daily_prep_lists" ON daily_prep_lists FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_menu_items" ON menu_items FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_recipes" ON recipes FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_allergens" ON allergens FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE ingredient_substitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_ingredient_substitutions" ON ingredient_substitutions FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE dishwasher_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_dishwasher_cycles" ON dishwasher_cycles FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_waste_logs" ON waste_logs FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 3: Cleaning & kitchen tables protected (11 tables)' as status;