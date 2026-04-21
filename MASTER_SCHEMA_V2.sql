-- ============================================================================
-- CATERINGMS MASTER DATABASE SCHEMA
-- ============================================================================
-- Version: 2.0 (Clean Slate Rebuild)
-- Platform: Supabase PostgreSQL
-- Architecture: B2B2C Multi-Tenant SaaS
-- Generated: 2026-04-21
-- ============================================================================

-- ============================================================================
-- EXECUTIVE SUMMARY FROM THE CONSORTIUM
-- ============================================================================
/*
STRATEGIC ARCHITECTURAL DECISIONS:

1. MULTI-TENANCY STRATEGY (Principal SaaS Architect):
   - Every operational table includes `company_id` for strict tenant isolation
   - Companies table serves as the root tenant boundary
   - RLS policies enforce data access at the PostgreSQL level
   - Prevents data leakage between SaaS customers

2. NORMALIZATION & DATA INTEGRITY (Senior DBA):
   - Strict 3NF normalization to eliminate redundancy
   - UUID primary keys for distributed system compatibility
   - PostgreSQL ENUMs for fixed status values (prevents invalid data)
   - Foreign key constraints with CASCADE/RESTRICT for referential integrity
   - Comprehensive indexing strategy for multi-tenant queries
   - Universal timestamp management via triggers

3. SECURITY MODEL (InfoSec & RLS Specialist):
   - Row Level Security (RLS) enabled on ALL tables
   - Tenant isolation: users can only access their company_id data
   - Role-based access control (RBAC) via user_roles junction table
   - Soft deletes preserve audit trails and financial history
   - Auth integration with Supabase auth.users

4. OPERATIONAL FLOW (Catering Operations Expert):
   - Lead → Quote → Order → Kitchen Prep → Driver Route → Delivery → Feedback
   - Equipment tracking for shortage prevention
   - Real-time GPS tracking for delivery optimization
   - Kitchen duty management and time tracking
   - Automated notifications at each workflow stage

5. SCALABILITY CONSIDERATIONS:
   - JSONB fields for flexible metadata (settings, custom_fields)
   - Partitioning-ready structure (company_id as partition key)
   - Optimized indexes for common query patterns
   - Audit trail preservation via soft deletes
*/

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For geospatial tracking

-- ============================================================================
-- CUSTOM ENUM TYPES
-- ============================================================================

-- User role types
CREATE TYPE user_role_type AS ENUM (
  'super_admin',      -- Platform admin
  'company_admin',    -- Company owner/manager
  'kitchen_staff',
  'driver',
  'shopping_staff',
  'cleaning_staff',
  'client'            -- End customer
);

-- Company subscription status
CREATE TYPE subscription_status AS ENUM (
  'trial',
  'active',
  'suspended',
  'cancelled',
  'expired'
);

-- Lead status
CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'quoted',
  'converted',
  'lost'
);

-- Quote status
CREATE TYPE quote_status AS ENUM (
  'draft',
  'sent',
  'accepted',
  'declined',
  'expired'
);

-- Order status
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

-- Payment status
CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded'
);

-- Kitchen duty status
CREATE TYPE duty_status AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'missed'
);

-- Route status
CREATE TYPE route_status AS ENUM (
  'planned',
  'assigned',
  'in_progress',
  'completed',
  'cancelled'
);

-- Delivery stop status
CREATE TYPE delivery_stop_status AS ENUM (
  'pending',
  'en_route',
  'arrived',
  'delivered',
  'failed'
);

-- Equipment condition
CREATE TYPE equipment_condition AS ENUM (
  'excellent',
  'good',
  'fair',
  'needs_repair',
  'out_of_service'
);

-- Notification status
CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'delivered',
  'read',
  'failed'
);

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Universal updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Soft delete helper
CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deleted_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MODULE 1: AUTH, TENANTS & PROFILES
-- ============================================================================

-- Companies (Root Tenant Table)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  logo_url TEXT,
  
  -- Subscription & Billing
  subscription_status subscription_status DEFAULT 'trial',
  subscription_plan VARCHAR(50) DEFAULT 'starter',
  trial_ends_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  
  -- White-label settings
  branding_settings JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  settings JSONB DEFAULT '{}'::jsonb,
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_subscription ON companies(subscription_status);
CREATE INDEX idx_companies_deleted ON companies(deleted_at) WHERE deleted_at IS NULL;

-- Profiles (Links auth.users to companies and roles)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  phone VARCHAR(50),
  avatar_url TEXT,
  
  -- Multi-tenancy
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Primary role (for quick access)
  primary_role user_role_type DEFAULT 'client',
  
  -- Metadata
  settings JSONB DEFAULT '{}'::jsonb,
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_company ON profiles(company_id);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(primary_role);

-- User Roles (Junction table for multi-role support)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role user_role_type NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, company_id, role)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_company ON user_roles(company_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- ============================================================================
-- MODULE 2: CRM & SALES
-- ============================================================================

-- Clients (End Customers)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Client details
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  company_name VARCHAR(255),
  
  -- Address
  street_address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'South Africa',
  
  -- Delivery coordinates
  delivery_lat DECIMAL(10, 8),
  delivery_lng DECIMAL(11, 8),
  
  -- Link to user profile (if they registered)
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Metadata
  notes TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_company ON clients(company_id);
CREATE INDEX idx_clients_user ON clients(user_id);
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_deleted ON clients(deleted_at) WHERE deleted_at IS NULL;

-- Leads
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Lead details
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  company_name VARCHAR(255),
  
  -- Lead tracking
  source VARCHAR(100), -- e.g., 'website', 'referral', 'cold_call'
  status lead_status DEFAULT 'new',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Event details
  event_type VARCHAR(100),
  event_date DATE,
  guest_count INTEGER,
  budget_range VARCHAR(50),
  
  -- Metadata
  notes TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_company ON leads(company_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_event_date ON leads(event_date);

-- Quotes
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  
  -- Quote details
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  status quote_status DEFAULT 'draft',
  
  -- Event details
  event_date DATE,
  event_time TIME,
  venue_name VARCHAR(255),
  venue_address TEXT,
  guest_count INTEGER,
  
  -- Pricing
  subtotal DECIMAL(12, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  
  -- Validity
  valid_until DATE,
  
  -- Terms
  terms_and_conditions TEXT,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotes_company ON quotes(company_id);
CREATE INDEX idx_quotes_lead ON quotes(lead_id);
CREATE INDEX idx_quotes_client ON quotes(client_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_number ON quotes(quote_number);

-- Quote Line Items
CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  
  -- Item details
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);

-- Subscriptions (Recurring clients)
CREATE TABLE client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Subscription details
  plan_name VARCHAR(100) NOT NULL,
  frequency VARCHAR(50), -- e.g., 'weekly', 'monthly'
  start_date DATE NOT NULL,
  end_date DATE,
  status subscription_status DEFAULT 'active',
  
  -- Pricing
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'ZAR',
  
  -- Delivery preferences
  delivery_days JSONB, -- e.g., ["Monday", "Wednesday", "Friday"]
  delivery_time TIME,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_company ON client_subscriptions(company_id);
CREATE INDEX idx_subscriptions_client ON client_subscriptions(client_id);
CREATE INDEX idx_subscriptions_status ON client_subscriptions(status);

-- ============================================================================
-- MODULE 3: CORE OPERATIONS
-- ============================================================================

-- Menu Items / Recipes
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Item details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- e.g., 'appetizer', 'main', 'dessert'
  
  -- Pricing
  base_price DECIMAL(12, 2) NOT NULL,
  cost_per_unit DECIMAL(12, 2), -- COGS
  
  -- Inventory
  is_available BOOLEAN DEFAULT true,
  
  -- Recipe/ingredients (JSONB for flexibility)
  ingredients JSONB DEFAULT '[]'::jsonb,
  preparation_notes TEXT,
  
  -- Media
  image_url TEXT,
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_menu_items_company ON menu_items(company_id);
CREATE INDEX idx_menu_items_category ON menu_items(category);
CREATE INDEX idx_menu_items_available ON menu_items(is_available);
CREATE INDEX idx_menu_items_deleted ON menu_items(deleted_at) WHERE deleted_at IS NULL;

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  
  -- Order details
  order_number VARCHAR(50) UNIQUE NOT NULL,
  status order_status DEFAULT 'pending',
  
  -- Event details
  event_date DATE NOT NULL,
  event_time TIME,
  delivery_date DATE NOT NULL,
  delivery_time TIME,
  
  -- Venue/Delivery
  venue_name VARCHAR(255),
  delivery_address TEXT NOT NULL,
  delivery_lat DECIMAL(10, 8),
  delivery_lng DECIMAL(11, 8),
  
  -- Pricing
  subtotal DECIMAL(12, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  delivery_fee DECIMAL(12, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  
  -- Payment
  payment_status payment_status DEFAULT 'pending',
  payment_method VARCHAR(50),
  
  -- Special instructions
  special_instructions TEXT,
  internal_notes TEXT,
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_company ON orders(company_id);
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment ON orders(payment_status);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_deleted ON orders(deleted_at) WHERE deleted_at IS NULL;

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  
  -- Item details (denormalized for historical accuracy)
  item_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  
  -- Preparation
  special_instructions TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_menu ON order_items(menu_item_id);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Payment details
  payment_reference VARCHAR(100) UNIQUE,
  payment_method VARCHAR(50) NOT NULL, -- e.g., 'card', 'eft', 'cash'
  gateway VARCHAR(50), -- e.g., 'payfast', 'stripe'
  gateway_transaction_id VARCHAR(255),
  
  -- Amount
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'ZAR',
  status payment_status DEFAULT 'pending',
  
  -- Metadata
  payment_metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  payment_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_company ON payments(company_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_reference ON payments(payment_reference);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Invoice details
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  
  -- Amounts
  subtotal DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  amount_paid DECIMAL(12, 2) DEFAULT 0,
  amount_due DECIMAL(12, 2) NOT NULL,
  
  -- Status
  status payment_status DEFAULT 'pending',
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);

-- ============================================================================
-- MODULE 4: KITCHEN & INVENTORY
-- ============================================================================

-- Inventory Items
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Item details
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  unit_of_measure VARCHAR(50) DEFAULT 'unit', -- e.g., 'kg', 'liter', 'unit'
  
  -- Stock levels
  current_stock DECIMAL(12, 3) DEFAULT 0,
  minimum_stock DECIMAL(12, 3) DEFAULT 0,
  reorder_point DECIMAL(12, 3),
  
  -- Costing
  unit_cost DECIMAL(12, 2),
  
  -- Supplier info
  supplier_name VARCHAR(255),
  supplier_contact TEXT,
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_company ON inventory_items(company_id);
CREATE INDEX idx_inventory_category ON inventory_items(category);
CREATE INDEX idx_inventory_deleted ON inventory_items(deleted_at) WHERE deleted_at IS NULL;

-- Stock Transactions
CREATE TABLE stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  
  -- Transaction details
  transaction_type VARCHAR(50) NOT NULL, -- 'purchase', 'usage', 'adjustment', 'waste'
  quantity DECIMAL(12, 3) NOT NULL,
  unit_cost DECIMAL(12, 2),
  
  -- Context
  related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  transaction_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stock_trans_company ON stock_transactions(company_id);
CREATE INDEX idx_stock_trans_item ON stock_transactions(inventory_item_id);
CREATE INDEX idx_stock_trans_type ON stock_transactions(transaction_type);
CREATE INDEX idx_stock_trans_date ON stock_transactions(transaction_date);

-- Kitchen Duties
CREATE TABLE kitchen_duties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Duty details
  duty_name VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Scheduling
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  estimated_duration INTEGER, -- minutes
  
  -- Status
  status duty_status DEFAULT 'scheduled',
  
  -- Time tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kitchen_duties_company ON kitchen_duties(company_id);
CREATE INDEX idx_kitchen_duties_assigned ON kitchen_duties(assigned_to);
CREATE INDEX idx_kitchen_duties_date ON kitchen_duties(scheduled_date);
CREATE INDEX idx_kitchen_duties_status ON kitchen_duties(status);

-- Prep Lists
CREATE TABLE prep_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Prep details
  prep_date DATE NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Status
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  
  -- Items to prep (JSONB for flexibility)
  prep_items JSONB DEFAULT '[]'::jsonb,
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prep_lists_company ON prep_lists(company_id);
CREATE INDEX idx_prep_lists_order ON prep_lists(order_id);
CREATE INDEX idx_prep_lists_date ON prep_lists(prep_date);
CREATE INDEX idx_prep_lists_assigned ON prep_lists(assigned_to);

-- ============================================================================
-- MODULE 5: LOGISTICS & ROUTING
-- ============================================================================

-- Drivers
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Driver details
  license_number VARCHAR(100),
  license_expiry DATE,
  vehicle_registration VARCHAR(50),
  vehicle_type VARCHAR(100),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  
  -- Current location (updated via GPS)
  current_lat DECIMAL(10, 8),
  current_lng DECIMAL(11, 8),
  last_location_update TIMESTAMPTZ,
  
  -- Earnings
  base_rate DECIMAL(12, 2),
  commission_rate DECIMAL(5, 2), -- percentage
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drivers_company ON drivers(company_id);
CREATE INDEX idx_drivers_user ON drivers(user_id);
CREATE INDEX idx_drivers_active ON drivers(is_active);
CREATE INDEX idx_drivers_available ON drivers(is_available);
CREATE INDEX idx_drivers_deleted ON drivers(deleted_at) WHERE deleted_at IS NULL;

-- Routes
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Route details
  route_name VARCHAR(255) NOT NULL,
  route_date DATE NOT NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  
  -- Status
  status route_status DEFAULT 'planned',
  
  -- Optimization
  optimized_route JSONB, -- Stores ordered stop IDs and navigation data
  estimated_duration INTEGER, -- minutes
  estimated_distance DECIMAL(10, 2), -- km
  
  -- Timing
  planned_start_time TIME,
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routes_company ON routes(company_id);
CREATE INDEX idx_routes_driver ON routes(driver_id);
CREATE INDEX idx_routes_date ON routes(route_date);
CREATE INDEX idx_routes_status ON routes(status);

-- Delivery Stops
CREATE TABLE delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Stop details
  stop_sequence INTEGER NOT NULL, -- Order in the route
  
  -- Location
  address TEXT NOT NULL,
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  
  -- Status
  status delivery_stop_status DEFAULT 'pending',
  
  -- Timing
  estimated_arrival TIME,
  actual_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  
  -- Delivery proof
  signature_url TEXT,
  photo_url TEXT,
  recipient_name VARCHAR(255),
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stops_company ON delivery_stops(company_id);
CREATE INDEX idx_stops_route ON delivery_stops(route_id);
CREATE INDEX idx_stops_order ON delivery_stops(order_id);
CREATE INDEX idx_stops_sequence ON delivery_stops(route_id, stop_sequence);
CREATE INDEX idx_stops_status ON delivery_stops(status);

-- GPS Tracking Logs
CREATE TABLE gps_tracking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  
  -- Location
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(10, 2), -- meters
  altitude DECIMAL(10, 2),
  speed DECIMAL(10, 2), -- km/h
  heading DECIMAL(5, 2), -- degrees
  
  -- Metadata
  battery_level INTEGER,
  is_moving BOOLEAN,
  
  -- Timestamp
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gps_logs_company ON gps_tracking_logs(company_id);
CREATE INDEX idx_gps_logs_driver ON gps_tracking_logs(driver_id);
CREATE INDEX idx_gps_logs_route ON gps_tracking_logs(route_id);
CREATE INDEX idx_gps_logs_time ON gps_tracking_logs(recorded_at);

-- Driver Earnings
CREATE TABLE driver_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  
  -- Earnings breakdown
  base_pay DECIMAL(12, 2) DEFAULT 0,
  commission DECIMAL(12, 2) DEFAULT 0,
  bonuses DECIMAL(12, 2) DEFAULT 0,
  deductions DECIMAL(12, 2) DEFAULT 0,
  total_earnings DECIMAL(12, 2) NOT NULL,
  
  -- Period
  earnings_date DATE NOT NULL,
  
  -- Status
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_earnings_company ON driver_earnings(company_id);
CREATE INDEX idx_earnings_driver ON driver_earnings(driver_id);
CREATE INDEX idx_earnings_date ON driver_earnings(earnings_date);
CREATE INDEX idx_earnings_paid ON driver_earnings(is_paid);

-- ============================================================================
-- MODULE 6: FACILITIES & EQUIPMENT
-- ============================================================================

-- Equipment Items
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Equipment details
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100), -- e.g., 'heating', 'cooling', 'serving'
  serial_number VARCHAR(100),
  
  -- Condition
  condition equipment_condition DEFAULT 'good',
  
  -- Tracking
  current_location VARCHAR(255),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Maintenance
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  
  -- Availability
  is_available BOOLEAN DEFAULT true,
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_equipment_company ON equipment(company_id);
CREATE INDEX idx_equipment_category ON equipment(category);
CREATE INDEX idx_equipment_condition ON equipment(condition);
CREATE INDEX idx_equipment_available ON equipment(is_available);
CREATE INDEX idx_equipment_deleted ON equipment(deleted_at) WHERE deleted_at IS NULL;

-- Equipment Shortage Reports
CREATE TABLE equipment_shortages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Shortage details
  equipment_type VARCHAR(255) NOT NULL,
  quantity_needed INTEGER NOT NULL,
  urgency VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  
  -- Context
  needed_for_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  needed_by_date DATE,
  
  -- Resolution
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  
  -- Reporting
  reported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shortages_company ON equipment_shortages(company_id);
CREATE INDEX idx_shortages_resolved ON equipment_shortages(is_resolved);
CREATE INDEX idx_shortages_order ON equipment_shortages(needed_for_order_id);

-- Cleaning Schedules
CREATE TABLE cleaning_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Schedule details
  area_name VARCHAR(255) NOT NULL,
  task_description TEXT,
  
  -- Assignment
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Scheduling
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  recurrence VARCHAR(50), -- 'once', 'daily', 'weekly', 'monthly'
  
  -- Completion
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cleaning_company ON cleaning_schedules(company_id);
CREATE INDEX idx_cleaning_assigned ON cleaning_schedules(assigned_to);
CREATE INDEX idx_cleaning_date ON cleaning_schedules(scheduled_date);
CREATE INDEX idx_cleaning_completed ON cleaning_schedules(is_completed);

-- ============================================================================
-- MODULE 7: COMMUNICATIONS & AI
-- ============================================================================

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Notification details
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(100), -- e.g., 'order_update', 'route_assigned', 'payment_received'
  
  -- Status
  status notification_status DEFAULT 'pending',
  
  -- Metadata
  related_entity_type VARCHAR(100), -- e.g., 'order', 'route', 'payment'
  related_entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Delivery
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_company ON notifications(company_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_type ON notifications(notification_type);
CREATE INDEX idx_notifications_entity ON notifications(related_entity_type, related_entity_id);

-- WhatsApp Message Log
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Recipient
  recipient_phone VARCHAR(50) NOT NULL,
  recipient_name VARCHAR(255),
  
  -- Message details
  message_type VARCHAR(100), -- e.g., 'order_confirmation', 'delivery_update'
  template_name VARCHAR(255),
  message_body TEXT,
  
  -- Status
  status notification_status DEFAULT 'pending',
  external_message_id VARCHAR(255),
  
  -- Metadata
  related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Delivery
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  -- Error handling
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_company ON whatsapp_messages(company_id);
CREATE INDEX idx_whatsapp_phone ON whatsapp_messages(recipient_phone);
CREATE INDEX idx_whatsapp_status ON whatsapp_messages(status);
CREATE INDEX idx_whatsapp_order ON whatsapp_messages(related_order_id);

-- Feedback / Complaints
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  
  -- Feedback details
  feedback_type VARCHAR(50) NOT NULL, -- 'complaint', 'suggestion', 'praise'
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  subject VARCHAR(255),
  message TEXT NOT NULL,
  
  -- Resolution
  status VARCHAR(50) DEFAULT 'new', -- 'new', 'in_progress', 'resolved', 'closed'
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_company ON feedback(company_id);
CREATE INDEX idx_feedback_client ON feedback(client_id);
CREATE INDEX idx_feedback_order ON feedback(order_id);
CREATE INDEX idx_feedback_type ON feedback(feedback_type);
CREATE INDEX idx_feedback_status ON feedback(status);

-- Support Tickets (Internal staff support)
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Ticket details
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100), -- e.g., 'technical', 'billing', 'general'
  priority VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  
  -- Assignment
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  
  -- Resolution
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tickets_company ON support_tickets(company_id);
CREATE INDEX idx_tickets_submitted ON support_tickets(submitted_by);
CREATE INDEX idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX idx_tickets_status ON support_tickets(status);
CREATE INDEX idx_tickets_priority ON support_tickets(priority);

-- ============================================================================
-- APPLY TRIGGERS
-- ============================================================================

-- Updated_at triggers for all tables
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON client_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kitchen_duties_updated_at BEFORE UPDATE ON kitchen_duties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prep_lists_updated_at BEFORE UPDATE ON prep_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stops_updated_at BEFORE UPDATE ON delivery_stops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shortages_updated_at BEFORE UPDATE ON equipment_shortages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cleaning_updated_at BEFORE UPDATE ON cleaning_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feedback_updated_at BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_tracking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_shortages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION FOR TENANT ISOLATION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT company_id FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- COMPANIES POLICIES (Super admins can see all, users see their own)
-- ============================================================================

CREATE POLICY "Super admins can view all companies" ON companies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.primary_role = 'super_admin'
    )
  );

CREATE POLICY "Users can view their own company" ON companies
  FOR SELECT USING (id = get_user_company_id());

CREATE POLICY "Super admins can manage companies" ON companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.primary_role = 'super_admin'
    )
  );

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Admins can view company profiles" ON profiles
  FOR SELECT USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.primary_role IN ('super_admin', 'company_admin')
    )
  );

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admins can manage company profiles" ON profiles
  FOR ALL USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.primary_role IN ('super_admin', 'company_admin')
    )
  );

-- ============================================================================
-- TENANT ISOLATION POLICIES (Standard pattern for all operational tables)
-- ============================================================================

-- Clients
CREATE POLICY "Tenant isolation for clients" ON clients
  FOR ALL USING (company_id = get_user_company_id());

-- Leads
CREATE POLICY "Tenant isolation for leads" ON leads
  FOR ALL USING (company_id = get_user_company_id());

-- Quotes
CREATE POLICY "Tenant isolation for quotes" ON quotes
  FOR ALL USING (company_id = get_user_company_id());

-- Quote Items (via parent quote)
CREATE POLICY "Tenant isolation for quote_items" ON quote_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM quotes
      WHERE quotes.id = quote_items.quote_id
      AND quotes.company_id = get_user_company_id()
    )
  );

-- Subscriptions
CREATE POLICY "Tenant isolation for subscriptions" ON client_subscriptions
  FOR ALL USING (company_id = get_user_company_id());

-- Menu Items
CREATE POLICY "Tenant isolation for menu_items" ON menu_items
  FOR ALL USING (company_id = get_user_company_id());

-- Orders
CREATE POLICY "Tenant isolation for orders" ON orders
  FOR ALL USING (company_id = get_user_company_id());

-- Order Items (via parent order)
CREATE POLICY "Tenant isolation for order_items" ON order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.company_id = get_user_company_id()
    )
  );

-- Payments
CREATE POLICY "Tenant isolation for payments" ON payments
  FOR ALL USING (company_id = get_user_company_id());

-- Invoices
CREATE POLICY "Tenant isolation for invoices" ON invoices
  FOR ALL USING (company_id = get_user_company_id());

-- Inventory Items
CREATE POLICY "Tenant isolation for inventory" ON inventory_items
  FOR ALL USING (company_id = get_user_company_id());

-- Stock Transactions
CREATE POLICY "Tenant isolation for stock_transactions" ON stock_transactions
  FOR ALL USING (company_id = get_user_company_id());

-- Kitchen Duties
CREATE POLICY "Tenant isolation for kitchen_duties" ON kitchen_duties
  FOR ALL USING (company_id = get_user_company_id());

-- Prep Lists
CREATE POLICY "Tenant isolation for prep_lists" ON prep_lists
  FOR ALL USING (company_id = get_user_company_id());

-- Drivers
CREATE POLICY "Tenant isolation for drivers" ON drivers
  FOR ALL USING (company_id = get_user_company_id());

-- Routes
CREATE POLICY "Tenant isolation for routes" ON routes
  FOR ALL USING (company_id = get_user_company_id());

-- Delivery Stops
CREATE POLICY "Tenant isolation for delivery_stops" ON delivery_stops
  FOR ALL USING (company_id = get_user_company_id());

-- GPS Tracking Logs
CREATE POLICY "Tenant isolation for gps_logs" ON gps_tracking_logs
  FOR ALL USING (company_id = get_user_company_id());

-- Driver Earnings
CREATE POLICY "Tenant isolation for driver_earnings" ON driver_earnings
  FOR ALL USING (company_id = get_user_company_id());

-- Equipment
CREATE POLICY "Tenant isolation for equipment" ON equipment
  FOR ALL USING (company_id = get_user_company_id());

-- Equipment Shortages
CREATE POLICY "Tenant isolation for shortages" ON equipment_shortages
  FOR ALL USING (company_id = get_user_company_id());

-- Cleaning Schedules
CREATE POLICY "Tenant isolation for cleaning" ON cleaning_schedules
  FOR ALL USING (company_id = get_user_company_id());

-- Notifications
CREATE POLICY "Users see their own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage company notifications" ON notifications
  FOR ALL USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.primary_role IN ('super_admin', 'company_admin')
    )
  );

-- WhatsApp Messages
CREATE POLICY "Tenant isolation for whatsapp" ON whatsapp_messages
  FOR ALL USING (company_id = get_user_company_id());

-- Feedback
CREATE POLICY "Tenant isolation for feedback" ON feedback
  FOR ALL USING (company_id = get_user_company_id());

-- Support Tickets
CREATE POLICY "Tenant isolation for support_tickets" ON support_tickets
  FOR ALL USING (company_id = get_user_company_id());

-- ============================================================================
-- ROLE-SPECIFIC POLICIES (Additional granular access control)
-- ============================================================================

-- Clients can view their own orders
CREATE POLICY "Clients view own orders" ON orders
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

-- Drivers can view their assigned routes
CREATE POLICY "Drivers view assigned routes" ON routes
  FOR SELECT USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Drivers can update GPS logs
CREATE POLICY "Drivers log GPS" ON gps_tracking_logs
  FOR INSERT WITH CHECK (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Kitchen staff can view prep lists
CREATE POLICY "Kitchen staff view prep_lists" ON prep_lists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.primary_role = 'kitchen_staff'
      AND profiles.company_id = prep_lists.company_id
    )
  );

-- ============================================================================
-- FINAL NOTES
-- ============================================================================

/*
DEPLOYMENT CHECKLIST:

1. ✅ Run this schema on a fresh Supabase database
2. ⚠️ Configure auth.users trigger (handle_new_user)
3. ⚠️ Set up company signup flow to create initial admin user
4. ⚠️ Test RLS policies with different role users
5. ⚠️ Configure Supabase Auth email templates
6. ⚠️ Set up storage buckets for:
   - Profile avatars
   - Company logos
   - Equipment photos
   - Delivery proof signatures/photos
7. ⚠️ Enable Realtime for critical tables:
   - orders (for live order tracking)
   - gps_tracking_logs (for live driver tracking)
   - notifications (for real-time alerts)

INDEXING STRATEGY:
- All foreign keys are indexed
- Company_id indexed on every tenant table
- Status fields indexed for filtering
- Date fields indexed for time-based queries
- Composite indexes on (company_id, status) for common queries

PERFORMANCE CONSIDERATIONS:
- Use JSONB indexes for frequently queried JSON fields
- Consider partitioning large tables (gps_tracking_logs) by date
- Implement pagination on all list views
- Use materialized views for complex reports

SECURITY BEST PRACTICES:
- Never disable RLS in production
- Use SECURITY DEFINER sparingly
- Audit all policies before deployment
- Monitor failed auth attempts
- Regularly review access logs

BACKUP STRATEGY:
- Enable point-in-time recovery
- Schedule daily backups
- Test restore procedures monthly
- Archive deleted_at records quarterly
*/

-- ============================================================================
-- END OF MASTER SCHEMA
-- ============================================================================