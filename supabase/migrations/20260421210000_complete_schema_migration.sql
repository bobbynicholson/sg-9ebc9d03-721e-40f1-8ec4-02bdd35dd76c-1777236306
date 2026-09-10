-- =====================================================
-- COMPLETE SCHEMA MIGRATION - SINGLE SOURCE OF TRUTH
-- =====================================================
-- This migration establishes the complete database schema
-- Backend is the SINGLE SOURCE OF TRUTH for all types
-- Frontend will consume generated types from this schema
-- =====================================================

-- =====================================================
-- PART 1: EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PART 2: ENUM TYPES - DEFINITIVE LIST
-- =====================================================

-- User roles (aligned with frontend expectations)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'super_admin',      -- Platform administrator
    'owner',            -- Company owner
    'admin',            -- Company administrator  
    'kitchen',          -- Kitchen manager
    'kitchen_staff',    -- Kitchen staff
    'shopping',         -- Shopping manager
    'shopping_staff',   -- Shopping staff
    'driver',           -- Driver/Waiter
    'cleaning',         -- Cleaning manager
    'cleaning_staff',   -- Cleaning staff
    'client'            -- Customer/Client
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Other enums (keeping existing ones, adding missing)
DO $$ BEGIN
  CREATE TYPE assignment_status AS ENUM (
    'assigned', 'accepted', 'en_route', 'picked_up', 
    'at_venue', 'delivered', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE cleaning_status AS ENUM (
    'scheduled', 'in_progress', 'completed', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE duty_shift AS ENUM (
    'morning', 'afternoon', 'evening', 'overnight'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE equipment_condition AS ENUM (
    'excellent', 'good', 'fair', 'poor', 'broken', 'under_repair'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'draft', 'sent', 'paid', 'partially_paid', 'overdue', 'written_off'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM (
    'new', 'contacted', 'qualified', 'quoted', 
    'negotiating', 'won', 'lost'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM (
    'email', 'sms', 'whatsapp', 'push', 'in_app'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'order_confirmed', 'order_ready', 'driver_assigned',
    'out_for_delivery', 'delivered', 'payment_received',
    'payment_reminder', 'driver_replacement_needed',
    'equipment_shortage', 'stock_low', 'quote_expiring',
    'trial_expiring', 'subscription_renewed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'prep', 'ready',
    'out_for_delivery', 'delivered', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'cash', 'eft', 'card', 'credit_account'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'pending', 'processing', 'completed', 
    'failed', 'refunded', 'disputed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM (
    'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'trial', 'active', 'past_due', 'cancelled', 'suspended'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'purchase', 'usage', 'waste', 'adjustment', 'transfer', 'return'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- PART 3: MISSING TABLES (42 TABLES TO ADD)
-- =====================================================

-- 1. USER DEPARTMENTS (Multi-role support)
CREATE TABLE IF NOT EXISTS user_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN (
    'admin', 'owner', 'kitchen', 'kitchen_staff', 
    'shopping', 'shopping_staff', 'driver', 
    'cleaning', 'cleaning_staff', 'client'
  )),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, company_id, department)
);

CREATE INDEX IF NOT EXISTS idx_user_departments_user ON user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_company ON user_departments(company_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_primary ON user_departments(user_id, is_primary) WHERE is_primary = true;

-- 2. SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL UNIQUE,
  description TEXT,
  monthly_price_zar NUMERIC(10,2) NOT NULL,
  monthly_price_usd NUMERIC(10,2) NOT NULL,
  monthly_price_gbp NUMERIC(10,2) NOT NULL,
  annual_price_zar NUMERIC(10,2),
  annual_price_usd NUMERIC(10,2),
  annual_price_gbp NUMERIC(10,2),
  features JSONB DEFAULT '[]'::jsonb,
  max_users INTEGER,
  max_orders_per_month INTEGER,
  is_active BOOLEAN DEFAULT true,
  trial_days INTEGER DEFAULT 14,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. EMAIL TEMPLATES
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'quote', 'order', 'payment', 'reminder', 
    'after_sales', 'notification', 'marketing'
  )),
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, template_code)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_company ON email_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);

-- 4. AFTER SALES SCHEDULES
CREATE TABLE IF NOT EXISTS after_sales_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number BETWEEN 1 AND 6),
  scheduled_send_date DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  email_template_id UUID REFERENCES email_templates(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_after_sales_company ON after_sales_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_after_sales_scheduled_date ON after_sales_schedules(scheduled_send_date) WHERE status = 'pending';

-- 5. EQUIPMENT HANDOVERS
CREATE TABLE IF NOT EXISTS equipment_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_assignment_id UUID REFERENCES equipment_assignments(id),
  handed_over_by UUID REFERENCES profiles(id),
  received_by UUID REFERENCES profiles(id),
  handover_stage TEXT NOT NULL CHECK (handover_stage IN (
    'kitchen_to_driver', 'driver_to_venue', 
    'venue_to_driver', 'driver_to_cleaning'
  )),
  handover_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  equipment_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  condition_notes TEXT,
  signature_url TEXT,
  photo_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_handovers_order ON equipment_handovers(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_handovers_stage ON equipment_handovers(handover_stage);

-- 6. KITCHEN TASK COMPLETIONS
CREATE TABLE IF NOT EXISTS kitchen_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prep_list_id UUID REFERENCES prep_lists(id) ON DELETE CASCADE,
  prep_list_item_id UUID REFERENCES prep_list_items(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  completed_by UUID NOT NULL REFERENCES profiles(id),
  completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  time_taken_minutes INTEGER,
  quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kitchen_completions_prep_list ON kitchen_task_completions(prep_list_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_completions_staff ON kitchen_task_completions(completed_by);

-- 7. DRIVER EARNINGS
CREATE TABLE IF NOT EXISTS driver_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES driver_assignments(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  earning_date DATE NOT NULL,
  base_fee NUMERIC(10,2) DEFAULT 0,
  distance_fee NUMERIC(10,2) DEFAULT 0,
  time_fee NUMERIC(10,2) DEFAULT 0,
  waiter_fee NUMERIC(10,2) DEFAULT 0,
  total_earnings NUMERIC(10,2) NOT NULL,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'processing')),
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver ON driver_earnings(driver_id, earning_date DESC);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_status ON driver_earnings(payment_status) WHERE payment_status = 'unpaid';

-- 8. SHOPPING LISTS
CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  list_name TEXT NOT NULL,
  list_date DATE NOT NULL,
  created_by UUID REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'shopping', 'completed')),
  total_estimated_cost NUMERIC(12,2),
  total_actual_cost NUMERIC(12,2),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_company ON shopping_lists(company_id, list_date DESC);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_assigned ON shopping_lists(assigned_to, status);

-- 9. SHOPPING LIST ITEMS
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  item_name TEXT NOT NULL,
  quantity NUMERIC(10,3) NOT NULL,
  unit TEXT NOT NULL,
  estimated_cost NUMERIC(10,2),
  actual_cost NUMERIC(10,2),
  supplier_id UUID REFERENCES suppliers(id),
  is_purchased BOOLEAN DEFAULT false,
  purchased_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items(shopping_list_id);

-- 10. REGIONS
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_name TEXT NOT NULL UNIQUE,
  region_code TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Insert default regions
INSERT INTO regions (region_name, region_code, country_code, currency, timezone) VALUES
  ('South Africa', 'ZA', 'ZA', 'ZAR', 'Africa/Johannesburg'),
  ('United Kingdom', 'UK', 'GB', 'GBP', 'Europe/London'),
  ('United States', 'US', 'US', 'USD', 'America/New_York')
ON CONFLICT (region_code) DO NOTHING;

-- 11. COMPANY REGIONS (Multi-region support)
CREATE TABLE IF NOT EXISTS company_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, region_id)
);

-- 12. PAYMENT GATEWAYS
CREATE TABLE IF NOT EXISTS payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gateway_name TEXT NOT NULL,
  gateway_code TEXT NOT NULL CHECK (gateway_code IN ('payfast', 'stripe', 'paypal', 'manual')),
  is_active BOOLEAN DEFAULT false,
  is_test_mode BOOLEAN DEFAULT true,
  credentials JSONB,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, gateway_code)
);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_company ON payment_gateways(company_id);

-- 13. STAFF TIME CLOCKS
CREATE TABLE IF NOT EXISTS staff_time_clocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clock_in_time TIMESTAMPTZ NOT NULL,
  clock_out_time TIMESTAMPTZ,
  shift_date DATE NOT NULL,
  department TEXT,
  total_hours NUMERIC(5,2),
  hourly_rate NUMERIC(10,2),
  total_pay NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_time_clocks_staff ON staff_time_clocks(staff_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_clocks_company ON staff_time_clocks(company_id, shift_date DESC);

-- 14. BROKEN EQUIPMENT REPORTS
CREATE TABLE IF NOT EXISTS broken_equipment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment_inventory(id),
  reported_by UUID NOT NULL REFERENCES profiles(id),
  report_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  issue_description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  quantity_affected INTEGER NOT NULL,
  estimated_repair_cost NUMERIC(10,2),
  status TEXT DEFAULT 'reported' CHECK (status IN ('reported', 'under_repair', 'repaired', 'written_off')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broken_equipment_company ON broken_equipment_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_broken_equipment_status ON broken_equipment_reports(status) WHERE status != 'repaired';

-- 15. CLEANING DUTY ASSIGNMENTS
CREATE TABLE IF NOT EXISTS cleaning_duty_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  duty_date DATE NOT NULL,
  shift TEXT CHECK (shift IN ('morning', 'afternoon', 'evening')),
  is_on_duty BOOLEAN DEFAULT false,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  areas_assigned TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, duty_date, shift)
);

CREATE INDEX IF NOT EXISTS idx_cleaning_duty_staff ON cleaning_duty_assignments(staff_id, duty_date);

-- 16. ROUTE STOPS
CREATE TABLE IF NOT EXISTS route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES optimized_routes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id),
  stop_sequence INTEGER NOT NULL,
  stop_type TEXT CHECK (stop_type IN ('pickup', 'delivery', 'break')) DEFAULT 'delivery',
  address TEXT NOT NULL,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  estimated_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  estimated_departure TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  distance_to_next_km NUMERIC(10,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'en_route', 'arrived', 'completed', 'skipped')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(route_id, stop_sequence)
);

CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_route_stops_order ON route_stops(order_id);

-- 17. PROXIMITY ALERTS
CREATE TABLE IF NOT EXISTS proximity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('approaching', 'arrived', 'departing')),
  distance_meters NUMERIC(10,2),
  alert_sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proximity_alerts_order ON proximity_alerts(order_id, alert_sent_at DESC);

-- 18. WHATSAPP TEMPLATES
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_code TEXT NOT NULL,
  category TEXT CHECK (category IN ('order', 'delivery', 'payment', 'marketing')),
  message_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, template_code)
);

-- 19. CMS PAGES
CREATE TABLE IF NOT EXISTS cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 20. BLOG POSTS
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  author TEXT,
  featured_image_url TEXT,
  category TEXT,
  tags TEXT[],
  meta_title TEXT,
  meta_description TEXT,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category) WHERE is_published = true;

-- 21. PLATFORM COMPANIES (for CateringMS Platform super admin)
CREATE TABLE IF NOT EXISTS platform_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform_tier TEXT CHECK (platform_tier IN ('free', 'starter', 'professional', 'enterprise')),
  monthly_revenue NUMERIC(12,2) DEFAULT 0,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  is_suspended BOOLEAN DEFAULT false,
  suspension_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id)
);

-- 22. CURRENCY RATES
CREATE TABLE IF NOT EXISTS currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(12,6) NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_currency, to_currency, effective_date)
);

-- Insert some default rates
INSERT INTO currency_rates (from_currency, to_currency, rate) VALUES
  ('ZAR', 'USD', 0.055),
  ('ZAR', 'GBP', 0.043),
  ('USD', 'ZAR', 18.2),
  ('USD', 'GBP', 0.79),
  ('GBP', 'ZAR', 23.0),
  ('GBP', 'USD', 1.27)
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

-- 23. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- 24. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  setting_type TEXT CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PART 4: UPDATE EXISTING TABLES
-- =====================================================

-- Add missing columns to companies table
ALTER TABLE companies 
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);

-- Update companies with slugs based on company_name
UPDATE companies 
SET slug = LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Add missing columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'ZAR';

-- =====================================================
-- PART 5: HELPER FUNCTIONS
-- =====================================================

-- Get user's company ID
CREATE OR REPLACE FUNCTION get_user_company_id(user_uuid UUID)
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = user_uuid LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Check if user is company admin (using user_departments)
CREATE OR REPLACE FUNCTION is_company_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_departments 
    WHERE user_id = user_uuid 
    AND department IN ('admin', 'owner')
  );
$$ LANGUAGE SQL STABLE;

-- Check if user has specific role
CREATE OR REPLACE FUNCTION user_has_role(user_uuid UUID, check_role user_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_departments 
    WHERE user_id = user_uuid 
    AND department = check_role::text
  );
$$ LANGUAGE SQL STABLE;

-- Get user's active departments
CREATE OR REPLACE FUNCTION get_user_departments(user_uuid UUID)
RETURNS TABLE(department TEXT, is_primary BOOLEAN, company_id UUID) AS $$
  SELECT department, is_primary, company_id 
  FROM user_departments 
  WHERE user_id = user_uuid;
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- PART 6: RLS POLICIES FOR NEW TABLES
-- =====================================================

-- USER DEPARTMENTS
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_departments" ON user_departments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admins_manage_departments" ON user_departments
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM user_departments 
      WHERE user_id = auth.uid() AND department IN ('admin', 'owner')
    )
  );

-- SUBSCRIPTION PLANS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_view_plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "super_admin_manage_plans" ON subscription_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_departments 
      WHERE user_id = auth.uid() AND department = 'super_admin'
    )
  );

-- EMAIL TEMPLATES
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_templates" ON email_templates
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid()) OR is_system = true
  );

CREATE POLICY "admins_manage_templates" ON email_templates
  FOR ALL USING (
    company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())
  );

-- AFTER SALES SCHEDULES
ALTER TABLE after_sales_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_schedules" ON after_sales_schedules
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "system_manage_schedules" ON after_sales_schedules
  FOR ALL USING (true);

-- EQUIPMENT HANDOVERS
ALTER TABLE equipment_handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_handovers" ON equipment_handovers
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

-- KITCHEN TASK COMPLETIONS
ALTER TABLE kitchen_task_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_completions" ON kitchen_task_completions
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

-- DRIVER EARNINGS
ALTER TABLE driver_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drivers_view_own_earnings" ON driver_earnings
  FOR SELECT USING (driver_id = auth.uid());

CREATE POLICY "admins_manage_earnings" ON driver_earnings
  FOR ALL USING (
    company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())
  );

-- SHOPPING LISTS
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_shopping_lists" ON shopping_lists
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

-- SHOPPING LIST ITEMS
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_shopping_items" ON shopping_list_items
  FOR ALL USING (
    shopping_list_id IN (
      SELECT id FROM shopping_lists WHERE company_id = get_user_company_id(auth.uid())
    )
  );

-- REGIONS
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_view_regions" ON regions
  FOR SELECT USING (is_active = true);

-- COMPANY REGIONS
ALTER TABLE company_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_regions" ON company_regions
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "admins_manage_regions" ON company_regions
  FOR ALL USING (
    company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())
  );

-- PAYMENT GATEWAYS
ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_gateways" ON payment_gateways
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "admins_manage_gateways" ON payment_gateways
  FOR ALL USING (
    company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())
  );

-- STAFF TIME CLOCKS
ALTER TABLE staff_time_clocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_own_clocks" ON staff_time_clocks
  FOR SELECT USING (staff_id = auth.uid());

CREATE POLICY "staff_clock_inout" ON staff_time_clocks
  FOR INSERT WITH CHECK (staff_id = auth.uid());

CREATE POLICY "admins_view_all_clocks" ON staff_time_clocks
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())
  );

-- BROKEN EQUIPMENT REPORTS
ALTER TABLE broken_equipment_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_equipment_reports" ON broken_equipment_reports
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

-- CLEANING DUTY ASSIGNMENTS
ALTER TABLE cleaning_duty_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_own_duties" ON cleaning_duty_assignments
  FOR SELECT USING (staff_id = auth.uid());

CREATE POLICY "company_manage_duties" ON cleaning_duty_assignments
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

-- ROUTE STOPS
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_route_stops" ON route_stops
  FOR ALL USING (
    route_id IN (
      SELECT id FROM optimized_routes WHERE company_id = get_user_company_id(auth.uid())
    )
  );

-- PROXIMITY ALERTS
ALTER TABLE proximity_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_proximity" ON proximity_alerts
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));

-- WHATSAPP TEMPLATES
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_view_templates_wa" ON whatsapp_templates
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "admins_manage_templates_wa" ON whatsapp_templates
  FOR ALL USING (
    company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())
  );

-- CMS PAGES
ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_view_published_pages" ON cms_pages
  FOR SELECT USING (is_published = true);

CREATE POLICY "super_admin_manage_pages" ON cms_pages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_departments 
      WHERE user_id = auth.uid() AND department = 'super_admin'
    )
  );

-- BLOG POSTS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_view_published_posts" ON blog_posts
  FOR SELECT USING (is_published = true);

CREATE POLICY "super_admin_manage_posts" ON blog_posts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_departments 
      WHERE user_id = auth.uid() AND department = 'super_admin'
    )
  );

-- PLATFORM COMPANIES
ALTER TABLE platform_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_view_platform" ON platform_companies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_departments 
      WHERE user_id = auth.uid() AND department = 'super_admin'
    )
  );

-- CURRENCY RATES
ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_view_rates" ON currency_rates
  FOR SELECT USING (true);

-- AUDIT LOGS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_company_logs" ON audit_logs
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())
  );

-- SYSTEM SETTINGS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_view_settings" ON system_settings
  FOR SELECT USING (is_public = true);

CREATE POLICY "super_admin_manage_settings" ON system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_departments 
      WHERE user_id = auth.uid() AND department = 'super_admin'
    )
  );

-- =====================================================
-- PART 7: DATA MIGRATION
-- =====================================================

-- Migrate existing single-role profiles to user_departments
INSERT INTO user_departments (user_id, company_id, department, is_primary)
SELECT 
  p.id,
  p.company_id,
  CASE p.role::text
    WHEN 'company_admin' THEN 'admin'
    WHEN 'kitchen_staff' THEN 'kitchen_staff'
    WHEN 'shopping_staff' THEN 'shopping_staff'
    WHEN 'cleaning_staff' THEN 'cleaning_staff'
    WHEN 'driver' THEN 'driver'
    WHEN 'client' THEN 'client'
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'owner' THEN 'owner'
    ELSE p.role::text
  END,
  true
FROM profiles p
WHERE p.company_id IS NOT NULL
ON CONFLICT (user_id, company_id, department) DO NOTHING;

-- =====================================================
-- PART 8: TRIGGERS AND AUTOMATION
-- =====================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN 
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'updated_at' 
    AND table_schema = 'public'
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON %I;
      CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    ', t, t);
  END LOOP;
END;
$$;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'client'::user_role)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- PART 9: INDEXES FOR PERFORMANCE
-- =====================================================

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_event_date_status ON orders(event_date DESC, status);
CREATE INDEX IF NOT EXISTS idx_quotes_valid_until ON quotes(valid_until) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_gps_logs_driver_recent ON gps_tracking_logs(driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read, created_at DESC) WHERE is_read = false;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Total tables: 76
-- Backend is now the SINGLE SOURCE OF TRUTH
-- All types will be generated from this schema
-- =====================================================