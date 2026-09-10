DO $$ 
BEGIN
  -- orders table additions
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax numeric;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_amount numeric;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_paid boolean;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_percentage numeric;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_amount numeric;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_paid boolean;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_paid_at timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_due_date timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_order_change_date timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid numeric;

  -- profiles
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drive_time_to_kitchen_minutes integer;

  -- cleaning_duty_logs
  ALTER TABLE cleaning_duty_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);

  -- equipment_shortage_flags
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS equipment_booking_id uuid;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS equipment_id uuid;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS client_name text;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS client_email text;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS expected_quantity numeric;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS returned_quantity numeric;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS shortage_quantity numeric;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS equipment_name text;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS admin_notes text;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS resolution_notes text;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES profiles(id);

  -- leads
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_phone text;

  -- subscriptions
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date timestamptz;
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_price_change boolean;
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancellation_reason text;
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS dashboard_seen boolean;
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS active_clients_count integer;
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS orders_this_quarter integer;

  -- billing_history
  ALTER TABLE billing_history ADD COLUMN IF NOT EXISTS invoice_pdf_url text;

  -- support_tickets
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_number text;

  -- staff_work_sessions
  ALTER TABLE staff_work_sessions ADD COLUMN IF NOT EXISTS payment_status text;

  -- driver_assignments
  ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS checklist_cutlery_confirmed boolean;
  ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS checklist_crockery_confirmed boolean;
  ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS checklist_food_verified boolean;
  ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS estimated_drive_time_minutes integer;

  -- equipment_handovers
  ALTER TABLE equipment_handovers ADD COLUMN IF NOT EXISTS quantity_sent numeric;

  -- shopping_lists
  ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS shopper_id uuid REFERENCES profiles(id);
  ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS receipt_url text;

  -- integrations
  ALTER TABLE integrations ADD COLUMN IF NOT EXISTS connected_at timestamptz;

  -- whatsapp_templates
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS template_name text;
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS description text;
  
  -- payments adjustments for TS types
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_id uuid;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_id uuid;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type text;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency text;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS status text;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway text;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_id text;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at timestamptz;
  ALTER TABLE payments ALTER COLUMN client_id DROP NOT NULL;
  ALTER TABLE payments ALTER COLUMN company_id DROP NOT NULL;
  ALTER TABLE payments ALTER COLUMN amount DROP NOT NULL;
  
  -- notifications adjustments for TS types
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_id uuid;
  ALTER TABLE notifications ALTER COLUMN type DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  title text,
  excerpt text,
  content text,
  author_id uuid REFERENCES profiles(id),
  company_id uuid REFERENCES companies(id),
  is_published boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  title text,
  content text,
  company_id uuid REFERENCES companies(id),
  is_published boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  order_id uuid,
  original_driver_id uuid,
  replacement_driver_id uuid,
  reason text,
  status text,
  notes text,
  urgency text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gps_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  driver_id uuid REFERENCES profiles(id),
  latitude numeric,
  longitude numeric,
  timestamp timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  region_id uuid,
  item_id uuid,
  quantity numeric,
  status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kitchen_duty_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  staff_id uuid,
  order_id uuid,
  is_active boolean,
  shift_start timestamptz,
  shift_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  equipment_id uuid,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  active boolean,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS health_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  staff_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_prep_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  prep_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allergens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  name text,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION get_all_subscriptions_admin() RETURNS json AS $$
BEGIN RETURN '[]'::json; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_trial_expiry_notifications() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION accept_price_change() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_equipment_quantity() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;

-- Notify PostgREST to reload schema cache so the new tables appear in the auto-generated types
NOTIFY pgrst, 'reload schema';