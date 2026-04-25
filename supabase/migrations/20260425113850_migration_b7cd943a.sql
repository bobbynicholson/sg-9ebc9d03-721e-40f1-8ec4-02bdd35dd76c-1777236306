DO $$ 
BEGIN
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_name text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_email text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_phone text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS total numeric(12,2);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_notes text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES profiles(id);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS collection_time timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS requires_waiter boolean DEFAULT false;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_duration_hours integer;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_hourly_rate numeric(10,2);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_total_fee numeric(10,2);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_service_required boolean DEFAULT false;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS equipment_return_method text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_total_fee numeric(10,2);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency text DEFAULT 'ZAR';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_km numeric(10,2);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_duration_minutes integer;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_rate_per_km numeric(10,2);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_route_optimized boolean DEFAULT false;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS xero_invoice_id text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS xero_synced_at timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_instructions text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_notifications_sent text[];

  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_slug text;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number text;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name text;

  ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_email text;
  ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_name text;
  ALTER TABLE quotes ADD COLUMN IF NOT EXISTS total numeric(12,2);

  ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_email text;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_name text;

  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority text;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link text;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type text;
  
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id text;
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false;

  ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES profiles(id);
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS subscriptions ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, plan_name text, plan_id text, status text, amount numeric, currency text, billing_cycle text, current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean, cancelled_at timestamptz, stripe_customer_id text, stripe_subscription_id text, trial_ends_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS billing_history ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, subscription_id uuid, amount numeric, currency text, status text, payment_method text, invoice_url text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS email_templates ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, name text, subject text, body text, category text, variables jsonb, is_active boolean, last_edited timestamptz, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS email_automation_log ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, order_id uuid, template_type text, recipient_email text, recipient_name text, subject text, status text, error_message text, sent_at timestamptz, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS support_tickets ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, subject text, description text, status text, priority text, category text, assigned_to uuid, resolved_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS support_ticket_messages ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid, user_id uuid, message text, is_from_staff boolean, is_internal boolean, created_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS cancellation_requests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, subscription_id uuid, cancellation_type text, reason text, feedback text, status text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS account_deletion_requests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text, reason text, data_export_requested boolean, scheduled_deletion_date timestamptz, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS payment_schedules ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, user_id uuid, total_amount numeric, currency text, deposit_amount numeric, deposit_percentage numeric, balance_amount numeric, balance_due_date timestamptz, final_order_change_date timestamptz, event_date timestamptz, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS payment_reminders ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, user_id uuid, reminder_date timestamptz, reminder_type text, days_before_due int, sent boolean, sent_at timestamptz, is_urgent boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS payment_gateways ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, is_active boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS staff_payment_ledger ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, staff_id uuid, payment_status text, total_earnings numeric, total_hours numeric, clock_in timestamptz, clock_out timestamptz, session_date date, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS driver_confirmations ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, driver_id uuid, confirmation_type text, location_lat numeric, location_lng numeric, confirmed_at timestamptz, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS delivery_route_stops ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, driver_id uuid, stop_type text, stop_name text, stop_address text, stop_lat numeric, stop_lng numeric, reason text, amount_spent numeric, receipt_url text, added_by_admin boolean, arrival_time timestamptz, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS deliveries ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, order_id uuid, driver_id uuid, status text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS driver_rest_logs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, driver_id uuid, compliant boolean, created_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS user_departments ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, department text, is_primary boolean, assigned_at timestamptz, assigned_by uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS staff_invitations ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, role text, status text, invitation_token text, expires_at timestamptz, invited_by uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS time_clock_entries ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, staff_id uuid, clock_in timestamptz, clock_out timestamptz, session_date date, total_hours numeric, total_earnings numeric, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS shopping_lists ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, list_date date, status text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS shopping_list_items ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shopping_list_id uuid, user_id uuid, purchased boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS purchase_history ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS supplier_prices ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, created_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS integrations ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, integration_type text, is_active boolean, credentials jsonb, xero_invoice_id text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS whatsapp_templates ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, template_key text, template_content text, is_enabled boolean, variables jsonb, updated_at timestamptz, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS email_settings ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, smtp_port int, created_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS equipment ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, category text, name text, quantity numeric, available_quantity numeric, condition text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS equipment_bookings ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, order_id uuid, equipment_id uuid, quantity numeric, booked_from timestamptz, booked_until timestamptz, available_from timestamptz, status text, returned_quantity numeric, admin_notified boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS equipment_damages ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, order_id uuid, damage_type text, resolved boolean, handover_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS equipment_cleaning_status ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, order_id uuid, returned_quantity numeric, admin_notified boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS equipment_shortages ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, order_id uuid, status text, priority text, replacement_cost numeric, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS equipment_shortage_flags ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, order_id uuid, status text, priority text, recipient_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS equipment_kits ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS equipment_kit_items ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, kit_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS utensil_tracking ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, status text, qr_code text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS linen_inventory ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS glassware_catalog ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, quantity_available numeric, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS cleaning_supplies ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, current_quantity numeric, created_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS vehicles ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS vehicle_maintenance ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, vehicle_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS vehicle_logs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, vehicle_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS storage_locations ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, active boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS temperature_logs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, storage_location_id uuid, alert_triggered boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS storage_racks ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS delivery_crates ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, status text, barcode text, created_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS pat_testing ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS backup_generators ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS fuel_stockpile ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS dishwasher_cycles ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS pest_control_logs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS safety_equipment ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS lighting_tests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, compliant boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS floor_safety_inspections ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS insurance_policies ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS financial_depreciation ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );

CREATE TABLE IF NOT EXISTS complaints ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, order_id uuid, status text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS load_plans ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, event_id uuid, verified_by uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS ice_tracking ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, event_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS loadoff_verifications ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, event_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS return_load_tracking ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, event_id uuid, scan_verification_complete boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS order_reviews ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, order_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS cleaning_duty_logs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, on_duty boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS gamification_points ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, order_id uuid, points numeric, action_type text, action_description text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS gamification_achievements ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, achievement_key text, achievement_name text, achievement_description text, icon text, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS admin_notifications ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, type text, title text, message text, priority text, read boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS currency_fluctuation_alerts ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, check_date date, start_rate numeric, end_rate numeric, percentage_change numeric, days_period int, alert_sent boolean, resolved boolean, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS exchange_rates ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), date date, usd_to_zar_rate numeric, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS recipe_allergens ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id uuid, allergen_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS waste_logs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE IF NOT EXISTS ingredient_substitutions ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_at timestamptz DEFAULT now() );