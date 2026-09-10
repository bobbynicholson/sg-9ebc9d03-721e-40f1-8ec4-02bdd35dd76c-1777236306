-- Fix RLS policies with correct syntax
-- First, create helper function to get user's company_id
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT company_id FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now enable RLS and create policies for all missing tables

-- 1. account_deletion_requests
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_deletion_requests" ON account_deletion_requests;
CREATE POLICY "users_own_deletion_requests" ON account_deletion_requests
  FOR ALL USING (user_id = auth.uid());

-- 2. billing_history
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_billing" ON billing_history;
CREATE POLICY "users_own_billing" ON billing_history
  FOR ALL USING (user_id = auth.uid());

-- 3. delivery_route_stops
ALTER TABLE delivery_route_stops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_access_route_stops" ON delivery_route_stops;
CREATE POLICY "company_access_route_stops" ON delivery_route_stops
  FOR ALL USING (
    order_id IN (
      SELECT id FROM orders 
      WHERE company_id = get_user_company_id()
    )
  );

-- 4. driver_confirmations
ALTER TABLE driver_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_own_confirmations" ON driver_confirmations;
CREATE POLICY "driver_own_confirmations" ON driver_confirmations
  FOR ALL USING (
    driver_id = auth.uid() OR 
    order_id IN (
      SELECT id FROM orders 
      WHERE company_id = get_user_company_id()
    )
  );

-- 5. email_automation_log
ALTER TABLE email_automation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_access_email_log" ON email_automation_log;
CREATE POLICY "company_access_email_log" ON email_automation_log
  FOR ALL USING (
    user_id IN (
      SELECT id FROM profiles 
      WHERE company_id = get_user_company_id()
    )
  );

-- 6. gps_tracking
ALTER TABLE gps_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_own_gps" ON gps_tracking;
DROP POLICY IF EXISTS "driver_log_gps" ON gps_tracking;
DROP POLICY IF EXISTS "company_view_gps" ON gps_tracking;
CREATE POLICY "driver_own_gps" ON gps_tracking
  FOR SELECT USING (driver_id = auth.uid());
CREATE POLICY "driver_log_gps" ON gps_tracking
  FOR INSERT WITH CHECK (driver_id = auth.uid());
CREATE POLICY "company_view_gps" ON gps_tracking
  FOR SELECT USING (
    driver_id IN (
      SELECT id FROM profiles 
      WHERE company_id = get_user_company_id()
    )
  );

-- 7. payment_reminders
ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_access_reminders" ON payment_reminders;
CREATE POLICY "company_access_reminders" ON payment_reminders
  FOR ALL USING (
    order_id IN (
      SELECT id FROM orders 
      WHERE company_id = get_user_company_id()
    )
  );

-- 8. payment_schedules
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_access_schedules" ON payment_schedules;
CREATE POLICY "company_access_schedules" ON payment_schedules
  FOR ALL USING (
    order_id IN (
      SELECT id FROM orders 
      WHERE company_id = get_user_company_id()
    )
  );

-- 9. purchase_history
ALTER TABLE purchase_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_purchases" ON purchase_history;
CREATE POLICY "users_own_purchases" ON purchase_history
  FOR ALL USING (user_id = auth.uid());

-- 10. recipe_allergens
ALTER TABLE recipe_allergens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_access_allergens" ON recipe_allergens;
CREATE POLICY "company_access_allergens" ON recipe_allergens
  FOR ALL USING (
    recipe_id IN (
      SELECT id FROM recipes 
      WHERE company_id = get_user_company_id()
    )
  );

-- 11. shopping_list_items
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_access_shopping_items" ON shopping_list_items;
CREATE POLICY "company_access_shopping_items" ON shopping_list_items
  FOR ALL USING (
    shopping_list_id IN (
      SELECT id FROM shopping_lists 
      WHERE company_id = get_user_company_id()
    )
  );

-- 12. supplier_prices
ALTER TABLE supplier_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_supplier_prices" ON supplier_prices;
CREATE POLICY "users_own_supplier_prices" ON supplier_prices
  FOR ALL USING (user_id = auth.uid());

-- 13. support_ticket_messages
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_ticket_messages" ON support_ticket_messages;
CREATE POLICY "users_own_ticket_messages" ON support_ticket_messages
  FOR ALL USING (
    ticket_id IN (
      SELECT id FROM support_tickets 
      WHERE user_id = auth.uid()
    )
  );

-- 14. user_departments
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_departments" ON user_departments;
CREATE POLICY "users_own_departments" ON user_departments
  FOR ALL USING (user_id = auth.uid());