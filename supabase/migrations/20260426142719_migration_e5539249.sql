-- E. Recreate policies to use get_user_company_id(auth.uid()) and drop the 0-arg function

DROP POLICY IF EXISTS "company_access_email_log" ON email_automation_log;
CREATE POLICY "company_access_email_log" ON email_automation_log FOR ALL USING (
  user_id IN (SELECT id FROM profiles WHERE company_id = get_user_company_id(auth.uid()))
);

DROP POLICY IF EXISTS "company_access_schedules" ON payment_schedules;
CREATE POLICY "company_access_schedules" ON payment_schedules FOR ALL USING (
  order_id IN (SELECT id FROM orders WHERE company_id = get_user_company_id(auth.uid()))
);

DROP POLICY IF EXISTS "company_access_reminders" ON payment_reminders;
CREATE POLICY "company_access_reminders" ON payment_reminders FOR ALL USING (
  order_id IN (SELECT id FROM orders WHERE company_id = get_user_company_id(auth.uid()))
);

DROP POLICY IF EXISTS "driver_own_confirmations" ON driver_confirmations;
CREATE POLICY "driver_own_confirmations" ON driver_confirmations FOR ALL USING (
  driver_id = auth.uid() OR order_id IN (SELECT id FROM orders WHERE company_id = get_user_company_id(auth.uid()))
);

DROP POLICY IF EXISTS "company_access_route_stops" ON delivery_route_stops;
CREATE POLICY "company_access_route_stops" ON delivery_route_stops FOR ALL USING (
  order_id IN (SELECT id FROM orders WHERE company_id = get_user_company_id(auth.uid()))
);

DROP POLICY IF EXISTS "company_access_shopping_items" ON shopping_list_items;
CREATE POLICY "company_access_shopping_items" ON shopping_list_items FOR ALL USING (
  shopping_list_id IN (SELECT id FROM shopping_lists WHERE company_id = get_user_company_id(auth.uid()))
);

DROP POLICY IF EXISTS "company_access_allergens" ON recipe_allergens;
CREATE POLICY "company_access_allergens" ON recipe_allergens FOR ALL USING (
  recipe_id IN (SELECT id FROM recipes WHERE company_id = get_user_company_id(auth.uid()))
);

DROP POLICY IF EXISTS "company_view_gps" ON gps_tracking;
CREATE POLICY "company_view_gps" ON gps_tracking FOR SELECT USING (
  driver_id IN (SELECT id FROM profiles WHERE company_id = get_user_company_id(auth.uid()))
);

-- Both references resolved, safely drop the duplicate no-arg function
DROP FUNCTION IF EXISTS get_user_company_id();