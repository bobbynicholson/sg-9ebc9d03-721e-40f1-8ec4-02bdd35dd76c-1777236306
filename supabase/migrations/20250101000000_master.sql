SET check_function_bodies = false;
-- =====================================================================================
-- CATERINGMS MASTER DATABASE SCHEMA
-- Version: 2.0 (Complete Re-Architecture)
-- Database: PostgreSQL 15+ (Supabase)
-- =====================================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =====================================================================================
-- ENUM DEFINITIONS
-- =====================================================================================

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'company_admin',
  'kitchen_staff',
  'driver',
  'shopping_staff',
  'cleaning_staff',
  'client'
);

CREATE TYPE subscription_status AS ENUM (
  'trial',
  'active',
  'past_due',
  'cancelled',
  'suspended'
);

CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'quoted',
  'negotiating',
  'won',
  'lost'
);

CREATE TYPE quote_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'expired'
);

CREATE TYPE order_status AS ENUM (
  'pending',
  'confirmed',
  'prep',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled'
);

CREATE TYPE assignment_status AS ENUM (
  'assigned',
  'accepted',
  'en_route',
  'picked_up',
  'at_venue',
  'delivered',
  'completed'
);

CREATE TYPE duty_shift AS ENUM (
  'morning',
  'afternoon',
  'evening',
  'overnight'
);

CREATE TYPE equipment_condition AS ENUM (
  'excellent',
  'good',
  'fair',
  'poor',
  'broken',
  'under_repair'
);

CREATE TYPE cleaning_status AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'skipped'
);

CREATE TYPE payment_method AS ENUM (
  'cash',
  'eft',
  'card',
  'credit_account'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'disputed'
);

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'paid',
  'partially_paid',
  'overdue',
  'written_off'
);

CREATE TYPE notification_type AS ENUM (
  'order_confirmed',
  'order_ready',
  'driver_assigned',
  'out_for_delivery',
  'delivered',
  'payment_received',
  'payment_reminder',
  'driver_replacement_needed',
  'equipment_shortage',
  'stock_low',
  'quote_expiring',
  'trial_expiring',
  'subscription_renewed'
);

CREATE TYPE notification_channel AS ENUM (
  'email',
  'sms',
  'whatsapp',
  'push',
  'in_app'
);

CREATE TYPE transaction_type AS ENUM (
  'purchase',
  'usage',
  'waste',
  'adjustment',
  'transfer',
  'return'
);

-- =====================================================================================
-- UTILITY FUNCTIONS & TRIGGERS
-- =====================================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deleted_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_company_id(user_id UUID)
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE id = user_id LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION user_has_role(user_id UUID, required_role user_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role = required_role
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_company_admin(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role IN ('company_admin', 'super_admin')
  );
$$ LANGUAGE sql STABLE;

-- =====================================================================================
-- COMPANIES TABLE
-- =====================================================================================

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  legal_name TEXT,
  registration_number TEXT,
  tax_number TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'South Africa',
  headquarters_lat DECIMAL(10, 8),
  headquarters_lng DECIMAL(11, 8),
  subscription_tier TEXT DEFAULT 'trial',
  subscription_status subscription_status DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  subscription_starts_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  billing_currency TEXT DEFAULT 'ZAR',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#10B981',
  custom_domain TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_companies_status ON public.companies(subscription_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_active ON public.companies(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_trial_expiry ON public.companies(trial_ends_at) WHERE subscription_status = 'trial';

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- PROFILES TABLE
-- =====================================================================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'client',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  date_of_birth DATE,
  id_number TEXT,
  drivers_license_number TEXT,
  drivers_license_expiry DATE,
  vehicle_registration TEXT,
  employee_number TEXT,
  date_hired DATE,
  hourly_rate DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  notification_preferences JSONB DEFAULT '{
    "email": true,
    "sms": false,
    "whatsapp": true,
    "push": true
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  active_role text DEFAULT 'client',
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT valid_role_company CHECK (
    role = 'super_admin' OR company_id IS NOT NULL
  ),
  CONSTRAINT profiles_role_check CHECK (role IN ('company_admin', 'client', 'driver', 'kitchen_staff', 'cleaning_staff', 'shopping_staff', 'super_admin'))
);

CREATE INDEX idx_profiles_company ON public.profiles(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_role ON public.profiles(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_email ON public.profiles(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_company_role ON public.profiles(company_id, role) WHERE deleted_at IS NULL;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, company_id, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'client'),
    (NEW.raw_user_meta_data->>'company_id')::UUID,
    TRUE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================================
-- CRM & SALES TABLES
-- =====================================================================================

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  event_type TEXT,
  event_date DATE,
  guest_count INTEGER,
  budget_range TEXT,
  venue_address TEXT,
  status lead_status DEFAULT 'new',
  source TEXT,
  assigned_to UUID REFERENCES public.profiles(id),
  notes TEXT,
  tags TEXT[],
  converted_to_client_id UUID,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_leads_company ON public.leads(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned ON public.leads(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_event_date ON public.leads(event_date) WHERE deleted_at IS NULL;

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_type TEXT DEFAULT 'individual',
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_postal_code TEXT,
  tax_number TEXT,
  credit_limit DECIMAL(12, 2) DEFAULT 0,
  outstanding_balance DECIMAL(12, 2) DEFAULT 0,
  payment_terms INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  account_manager UUID REFERENCES public.profiles(id),
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_clients_company ON public.clients(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_user ON public.clients(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_active ON public.clients(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  quote_name TEXT NOT NULL,
  event_date DATE,
  guest_count INTEGER,
  venue_address TEXT,
  venue_lat DECIMAL(10, 8),
  venue_lng DECIMAL(11, 8),
  subtotal DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  status quote_status DEFAULT 'draft',
  valid_until DATE,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  converted_to_order_id UUID,
  notes TEXT,
  terms_and_conditions TEXT,
  prepared_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT quote_has_lead_or_client CHECK (lead_id IS NOT NULL OR client_id IS NOT NULL),
  CONSTRAINT unique_quote_number UNIQUE (company_id, quote_number)
);

CREATE INDEX idx_quotes_company ON public.quotes(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_lead ON public.quotes(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_client ON public.quotes(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_event_date ON public.quotes(event_date) WHERE deleted_at IS NULL;

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(12, 2) NOT NULL,
  menu_item_id UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quote_items_quote ON public.quote_items(quote_id);

CREATE TRIGGER update_quote_items_updated_at BEFORE UPDATE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subscription_name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  recurring_amount DECIMAL(12, 2) NOT NULL,
  default_venue_address TEXT,
  default_venue_lat DECIMAL(10, 8),
  default_venue_lng DECIMAL(11, 8),
  default_delivery_time TIME,
  default_guest_count INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  paused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  auto_generate_orders BOOLEAN DEFAULT TRUE,
  generate_days_in_advance INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_client_subscriptions_company ON public.client_subscriptions(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_subscriptions_client ON public.client_subscriptions(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_subscriptions_active ON public.client_subscriptions(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER update_client_subscriptions_updated_at BEFORE UPDATE ON public.client_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- CORE OPERATIONS TABLES
-- =====================================================================================

CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  base_price DECIMAL(10, 2) NOT NULL,
  cost_per_unit DECIMAL(10, 2),
  is_available BOOLEAN DEFAULT TRUE,
  requires_advance_notice_hours INTEGER DEFAULT 24,
  dietary_tags TEXT[],
  allergen_info TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_menu_items_company ON public.menu_items(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_items_available ON public.menu_items(is_available) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_items_category ON public.menu_items(company_id, category) WHERE deleted_at IS NULL;

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  recipe_name TEXT NOT NULL,
  base_servings INTEGER NOT NULL,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipes_menu_item ON public.recipes(menu_item_id);

CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  inventory_item_id UUID,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10, 3) NOT NULL,
  unit TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipe_ingredients_recipe ON public.recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_inventory ON public.recipe_ingredients(inventory_item_id);

CREATE TRIGGER update_recipe_ingredients_updated_at BEFORE UPDATE ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  subscription_id UUID REFERENCES public.client_subscriptions(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  guest_count INTEGER NOT NULL,
  venue_name TEXT,
  venue_address TEXT NOT NULL,
  venue_lat DECIMAL(10, 8),
  venue_lng DECIMAL(11, 8),
  venue_contact_person TEXT,
  venue_contact_phone TEXT,
  special_instructions TEXT,
  dietary_requirements TEXT,
  subtotal DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  delivery_fee DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  payment_method payment_method,
  amount_paid DECIMAL(12, 2) DEFAULT 0,
  status order_status DEFAULT 'pending',
  confirmed_at TIMESTAMPTZ,
  prep_started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_order_number UNIQUE (company_id, order_number)
);

CREATE INDEX idx_orders_company ON public.orders(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_client ON public.orders(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_event_date ON public.orders(company_id, event_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_status ON public.orders(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_subscription ON public.orders(subscription_id) WHERE deleted_at IS NULL;

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(12, 2) NOT NULL,
  special_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_menu ON public.order_items(menu_item_id);

CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_reference TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  payment_method payment_method NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  gateway_provider TEXT,
  gateway_transaction_id TEXT,
  gateway_response JSONB,
  payment_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_company ON public.payments(company_id, payment_date DESC);
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_payments_client ON public.payments(client_id);
CREATE INDEX idx_payments_status ON public.payments(payment_status);
CREATE INDEX idx_payments_gateway ON public.payments(gateway_transaction_id);

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  amount_paid DECIMAL(12, 2) DEFAULT 0,
  balance_due DECIMAL(12, 2) NOT NULL,
  status invoice_status DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_invoice_number UNIQUE (company_id, invoice_number)
);

CREATE INDEX idx_invoices_company ON public.invoices(company_id, invoice_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_client ON public.invoices(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_order ON public.invoices(order_id);
CREATE INDEX idx_invoices_status ON public.invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date) WHERE status != 'paid' AND deleted_at IS NULL;

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- KITCHEN & INVENTORY TABLES
-- =====================================================================================

CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  sku TEXT,
  unit_of_measure TEXT NOT NULL,
  current_stock DECIMAL(10, 3) DEFAULT 0,
  minimum_stock DECIMAL(10, 3) DEFAULT 0,
  maximum_stock DECIMAL(10, 3),
  reorder_quantity DECIMAL(10, 3),
  cost_per_unit DECIMAL(10, 2),
  preferred_supplier_id UUID,
  storage_location TEXT,
  storage_instructions TEXT,
  is_perishable BOOLEAN DEFAULT FALSE,
  shelf_life_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_inventory_items_company ON public.inventory_items(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_items_category ON public.inventory_items(company_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_items_low_stock ON public.inventory_items(company_id) 
  WHERE current_stock <= minimum_stock AND deleted_at IS NULL;

CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  payment_terms INTEGER DEFAULT 30,
  account_number TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_suppliers_company ON public.suppliers(company_id) WHERE deleted_at IS NULL;

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.inventory_items
  ADD CONSTRAINT fk_inventory_preferred_supplier
  FOREIGN KEY (preferred_supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE TABLE public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  transaction_type transaction_type NOT NULL,
  quantity DECIMAL(10, 3) NOT NULL,
  unit_cost DECIMAL(10, 2),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference_number TEXT,
  notes TEXT,
  performed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_transactions_company ON public.inventory_transactions(company_id);
CREATE INDEX idx_inventory_transactions_item ON public.inventory_transactions(inventory_item_id);
CREATE INDEX idx_inventory_transactions_order ON public.inventory_transactions(order_id);
CREATE INDEX idx_inventory_transactions_date ON public.inventory_transactions(company_id, created_at DESC);

CREATE TABLE public.prep_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  prep_date DATE NOT NULL,
  assigned_to UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prep_lists_company ON public.prep_lists(company_id);
CREATE INDEX idx_prep_lists_order ON public.prep_lists(order_id);
CREATE INDEX idx_prep_lists_date ON public.prep_lists(company_id, prep_date);
CREATE INDEX idx_prep_lists_assigned ON public.prep_lists(assigned_to);

CREATE TRIGGER update_prep_lists_updated_at BEFORE UPDATE ON public.prep_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.prep_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_list_id UUID NOT NULL REFERENCES public.prep_lists(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  task_description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prep_list_items_prep_list ON public.prep_list_items(prep_list_id);
CREATE INDEX idx_prep_list_items_completed ON public.prep_list_items(is_completed);

CREATE TRIGGER update_prep_list_items_updated_at BEFORE UPDATE ON public.prep_list_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.kitchen_duties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  duty_date DATE NOT NULL,
  shift duty_shift NOT NULL,
  is_on_duty BOOLEAN DEFAULT FALSE,
  clock_in_time TIMESTAMPTZ,
  clock_out_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_kitchen_duties_company ON public.kitchen_duties(company_id);
CREATE INDEX idx_kitchen_duties_staff ON public.kitchen_duties(staff_id);
CREATE INDEX idx_kitchen_duties_date ON public.kitchen_duties(company_id, duty_date);

CREATE TRIGGER update_kitchen_duties_updated_at BEFORE UPDATE ON public.kitchen_duties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- LOGISTICS & ROUTING TABLES
-- =====================================================================================

CREATE TABLE public.driver_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status assignment_status DEFAULT 'assigned',
  assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  arrived_at_venue_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  base_fee DECIMAL(10, 2),
  distance_fee DECIMAL(10, 2),
  total_earnings DECIMAL(10, 2),
  notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_driver_assignments_company ON public.driver_assignments(company_id);
CREATE INDEX idx_driver_assignments_order ON public.driver_assignments(order_id);
CREATE INDEX idx_driver_assignments_driver ON public.driver_assignments(driver_id, status);
CREATE INDEX idx_driver_assignments_status ON public.driver_assignments(status);

CREATE TRIGGER update_driver_assignments_updated_at BEFORE UPDATE ON public.driver_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.optimized_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  route_name TEXT NOT NULL,
  route_date DATE NOT NULL,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_stops INTEGER DEFAULT 0,
  total_distance_km DECIMAL(10, 2),
  estimated_duration_minutes INTEGER,
  optimized_at TIMESTAMPTZ,
  optimization_algorithm TEXT DEFAULT 'nearest_neighbor',
  is_active BOOLEAN DEFAULT TRUE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_optimized_routes_company ON public.optimized_routes(company_id);
CREATE INDEX idx_optimized_routes_driver ON public.optimized_routes(driver_id);
CREATE INDEX idx_optimized_routes_date ON public.optimized_routes(company_id, route_date);

CREATE TRIGGER update_optimized_routes_updated_at BEFORE UPDATE ON public.optimized_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.optimized_routes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  venue_address TEXT NOT NULL,
  venue_lat DECIMAL(10, 8),
  venue_lng DECIMAL(11, 8),
  estimated_arrival_time TIMESTAMPTZ,
  actual_arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  distance_to_next_km DECIMAL(10, 2),
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 2,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_delivery_stops_route ON public.delivery_stops(route_id, sequence_number);
CREATE INDEX idx_delivery_stops_order ON public.delivery_stops(order_id);

CREATE TRIGGER update_delivery_stops_updated_at BEFORE UPDATE ON public.delivery_stops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.gps_tracking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy_meters DECIMAL(6, 2),
  altitude_meters DECIMAL(8, 2),
  speed_kmh DECIMAL(6, 2),
  heading_degrees DECIMAL(5, 2),
  assignment_id UUID REFERENCES public.driver_assignments(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.optimized_routes(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gps_logs_driver_time ON public.gps_tracking_logs(driver_id, recorded_at DESC);
CREATE INDEX idx_gps_logs_assignment ON public.gps_tracking_logs(assignment_id);
CREATE INDEX idx_gps_logs_route ON public.gps_tracking_logs(route_id);

CREATE INDEX idx_gps_logs_location ON public.gps_tracking_logs USING GIST (
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);

CREATE TABLE public.driver_replacement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  original_driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pending',
  replacement_driver_id UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_driver_replacement_company ON public.driver_replacement_requests(company_id);
CREATE INDEX idx_driver_replacement_order ON public.driver_replacement_requests(order_id);
CREATE INDEX idx_driver_replacement_status ON public.driver_replacement_requests(status);

CREATE TRIGGER update_driver_replacement_updated_at BEFORE UPDATE ON public.driver_replacement_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- FACILITIES & EQUIPMENT TABLES
-- =====================================================================================

CREATE TABLE public.equipment_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  equipment_type TEXT,
  description TEXT,
  total_quantity INTEGER NOT NULL,
  available_quantity INTEGER NOT NULL,
  in_use_quantity INTEGER DEFAULT 0,
  broken_quantity INTEGER DEFAULT 0,
  rental_price_per_unit DECIMAL(10, 2),
  replacement_cost DECIMAL(10, 2),
  overall_condition equipment_condition DEFAULT 'good',
  storage_location TEXT,
  last_maintenance_date DATE,
  next_maintenance_due DATE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_equipment_inventory_company ON public.equipment_inventory(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_equipment_inventory_type ON public.equipment_inventory(company_id, equipment_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_equipment_inventory_available ON public.equipment_inventory(company_id) 
  WHERE available_quantity > 0 AND deleted_at IS NULL;

CREATE TRIGGER update_equipment_inventory_updated_at BEFORE UPDATE ON public.equipment_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.equipment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment_inventory(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  quantity_assigned INTEGER NOT NULL,
  status TEXT DEFAULT 'reserved',
  assigned_date DATE NOT NULL,
  expected_return_date DATE,
  actual_return_date DATE,
  condition_at_dispatch equipment_condition,
  condition_at_return equipment_condition,
  damage_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_equipment_assignments_company ON public.equipment_assignments(company_id);
CREATE INDEX idx_equipment_assignments_equipment ON public.equipment_assignments(equipment_id);
CREATE INDEX idx_equipment_assignments_order ON public.equipment_assignments(order_id);
CREATE INDEX idx_equipment_assignments_status ON public.equipment_assignments(status);

CREATE TRIGGER update_equipment_assignments_updated_at BEFORE UPDATE ON public.equipment_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.equipment_shortage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment_inventory(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  required_quantity INTEGER NOT NULL,
  available_quantity INTEGER NOT NULL,
  shortage_quantity INTEGER NOT NULL,
  severity TEXT DEFAULT 'medium',
  impact_description TEXT,
  status TEXT DEFAULT 'open',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  reported_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_equipment_shortage_company ON public.equipment_shortage_reports(company_id);
CREATE INDEX idx_equipment_shortage_equipment ON public.equipment_shortage_reports(equipment_id);
CREATE INDEX idx_equipment_shortage_status ON public.equipment_shortage_reports(status);
CREATE INDEX idx_equipment_shortage_severity ON public.equipment_shortage_reports(severity);

CREATE TRIGGER update_equipment_shortage_updated_at BEFORE UPDATE ON public.equipment_shortage_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.cleaning_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  area_name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  assigned_to UUID REFERENCES public.profiles(id),
  status cleaning_status DEFAULT 'scheduled',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id),
  verification_photos TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cleaning_schedules_company ON public.cleaning_schedules(company_id);
CREATE INDEX idx_cleaning_schedules_date ON public.cleaning_schedules(company_id, scheduled_date);
CREATE INDEX idx_cleaning_schedules_assigned ON public.cleaning_schedules(assigned_to);
CREATE INDEX idx_cleaning_schedules_status ON public.cleaning_schedules(status);

CREATE TRIGGER update_cleaning_schedules_updated_at BEFORE UPDATE ON public.cleaning_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- COMMUNICATIONS & AI TABLES
-- =====================================================================================

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channels notification_channel[] DEFAULT ARRAY['in_app']::notification_channel[],
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  related_entity_type TEXT,
  related_entity_id UUID,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_company ON public.notifications(company_id, created_at DESC);
CREATE INDEX idx_notifications_type ON public.notifications(type);

CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT,
  message_content TEXT NOT NULL,
  template_name TEXT,
  template_params JSONB,
  status TEXT DEFAULT 'pending',
  gateway_message_id TEXT,
  gateway_response JSONB,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_whatsapp_messages_company ON public.whatsapp_messages(company_id, created_at DESC);
CREATE INDEX idx_whatsapp_messages_status ON public.whatsapp_messages(status);
CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages(recipient_phone);

CREATE TABLE public.delivery_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  food_quality_rating INTEGER CHECK (food_quality_rating >= 1 AND food_quality_rating <= 5),
  delivery_timeliness_rating INTEGER CHECK (delivery_timeliness_rating >= 1 AND delivery_timeliness_rating <= 5),
  driver_professionalism_rating INTEGER CHECK (driver_professionalism_rating >= 1 AND driver_professionalism_rating <= 5),
  overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
  comments TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  requires_follow_up BOOLEAN DEFAULT FALSE,
  followed_up_at TIMESTAMPTZ,
  followed_up_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_delivery_feedback_company ON public.delivery_feedback(company_id);
CREATE INDEX idx_delivery_feedback_order ON public.delivery_feedback(order_id);
CREATE INDEX idx_delivery_feedback_client ON public.delivery_feedback(client_id);
CREATE INDEX idx_delivery_feedback_rating ON public.delivery_feedback(overall_rating);

CREATE TRIGGER update_delivery_feedback_updated_at BEFORE UPDATE ON public.delivery_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.complaint_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  complainant_name TEXT NOT NULL,
  complainant_email TEXT,
  complainant_phone TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  category TEXT,
  severity TEXT DEFAULT 'medium',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority INTEGER DEFAULT 3,
  assigned_to UUID REFERENCES public.profiles(id),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  compensation_offered TEXT,
  compensation_amount DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_ticket_number UNIQUE (company_id, ticket_number)
);

CREATE INDEX idx_complaint_tickets_company ON public.complaint_tickets(company_id);
CREATE INDEX idx_complaint_tickets_status ON public.complaint_tickets(status);
CREATE INDEX idx_complaint_tickets_assigned ON public.complaint_tickets(assigned_to);
CREATE INDEX idx_complaint_tickets_severity ON public.complaint_tickets(severity);

CREATE TRIGGER update_complaint_tickets_updated_at BEFORE UPDATE ON public.complaint_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimized_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tracking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_replacement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_shortage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_tickets ENABLE ROW LEVEL SECURITY;

-- COMPANIES TABLE POLICIES
CREATE POLICY "super_admin_all_companies" ON public.companies
  FOR ALL USING (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "company_admin_own_company" ON public.companies
  FOR SELECT USING (id = get_user_company_id(auth.uid()));

CREATE POLICY "company_admin_update_own" ON public.companies
  FOR UPDATE USING (id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- PROFILES TABLE POLICIES
CREATE POLICY "users_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "company_admin_view_staff" ON public.profiles
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "company_admin_create_staff" ON public.profiles
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "company_admin_update_staff" ON public.profiles
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "super_admin_all_profiles" ON public.profiles
  FOR ALL USING (user_has_role(auth.uid(), 'super_admin'));

-- STANDARD TENANT ISOLATION POLICIES (LEADS)
CREATE POLICY "tenant_isolation_select_leads" ON public.leads
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "tenant_isolation_insert_leads" ON public.leads
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "tenant_isolation_update_leads" ON public.leads
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "admin_delete_leads" ON public.leads
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- CLIENTS TABLE POLICIES
CREATE POLICY "tenant_isolation_select_clients" ON public.clients
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "tenant_isolation_insert_clients" ON public.clients
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "tenant_isolation_update_clients" ON public.clients
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- ORDERS TABLE POLICIES
CREATE POLICY "tenant_isolation_select_orders" ON public.orders
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    OR client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation_insert_orders" ON public.orders
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "tenant_isolation_update_orders" ON public.orders
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- DRIVER-SPECIFIC POLICIES
CREATE POLICY "driver_own_assignments" ON public.driver_assignments
  FOR SELECT USING (driver_id = auth.uid() OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "driver_update_assignments" ON public.driver_assignments
  FOR UPDATE USING (driver_id = auth.uid());

CREATE POLICY "driver_own_routes" ON public.optimized_routes
  FOR SELECT USING (driver_id = auth.uid() OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "driver_log_gps" ON public.gps_tracking_logs
  FOR INSERT WITH CHECK (driver_id = auth.uid());

CREATE POLICY "driver_view_gps" ON public.gps_tracking_logs
  FOR SELECT USING (driver_id = auth.uid());

-- KITCHEN STAFF POLICIES
CREATE POLICY "kitchen_view_prep_lists" ON public.prep_lists
  FOR SELECT USING (assigned_to = auth.uid() OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "kitchen_update_prep_lists" ON public.prep_lists
  FOR UPDATE USING (assigned_to = auth.uid() OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "kitchen_view_duties" ON public.kitchen_duties
  FOR SELECT USING (staff_id = auth.uid() OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "kitchen_update_duties" ON public.kitchen_duties
  FOR UPDATE USING (staff_id = auth.uid());

-- NOTIFICATIONS POLICIES
CREATE POLICY "user_own_notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_update_notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "system_create_notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- DELIVERY FEEDBACK POLICIES
CREATE POLICY "client_own_feedback" ON public.delivery_feedback
  FOR SELECT USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "client_submit_feedback" ON public.delivery_feedback
  FOR INSERT WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

-- =====================================================================================
-- DATABASE MAINTENANCE PROCEDURES
-- =====================================================================================

CREATE OR REPLACE FUNCTION archive_old_gps_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.gps_tracking_logs WHERE recorded_at < CURRENT_DATE - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_overdue_invoices()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.invoices SET status = 'overdue'
  WHERE due_date < CURRENT_DATE AND status = 'sent' AND deleted_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;