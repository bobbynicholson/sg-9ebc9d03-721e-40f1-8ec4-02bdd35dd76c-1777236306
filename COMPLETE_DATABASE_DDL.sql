-- =====================================================
-- CATERING MANAGEMENT PLATFORM - COMPLETE DATABASE DDL
-- =====================================================
-- This script contains the complete database schema for the catering management platform
-- Run this script on a PostgreSQL database with the uuid-ossp extension enabled

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CORE USER MANAGEMENT
-- =====================================================

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  company_name TEXT,
  phone TEXT,
  phone_number TEXT,
  currency TEXT DEFAULT 'ZAR',
  role TEXT DEFAULT 'client' CHECK (role IN ('admin', 'client', 'driver', 'kitchen', 'cleaning', 'shopping', 'super_admin')),
  active_role TEXT,
  company_id UUID,
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'cancelled', 'expired', 'payment_failed')),
  subscription_plan TEXT,
  trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days'),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all company users" ON profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.role IN ('admin', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
  )
);
CREATE POLICY "Admins can update all company users" ON profiles FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.role IN ('admin', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
  )
);
CREATE POLICY "Admins can insert company users" ON profiles FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.role IN ('admin', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
  )
);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subscription_status TEXT DEFAULT 'trial',
  subscription_plan TEXT,
  trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days'),
  currency TEXT DEFAULT 'ZAR',
  settings JSONB DEFAULT '{}',
  branding JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their company" ON companies FOR SELECT USING (
  id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- =====================================================
-- 2. SUBSCRIPTION MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'payment_failed')),
  payfast_token TEXT,
  payfast_subscription_id TEXT,
  current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own subscriptions" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscriptions" ON subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- 3. REGIONS & MULTI-LOCATION
-- =====================================================

CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'South Africa',
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own regions" ON regions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own regions" ON regions FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 4. LEADS & QUOTES
-- =====================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  event_type TEXT,
  event_date DATE,
  guest_count INTEGER,
  budget DECIMAL(10,2),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  source TEXT,
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view leads in their account" ON leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage leads in their account" ON leads FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  quote_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  venue_address TEXT,
  guest_count INTEGER NOT NULL,
  menu_items JSONB DEFAULT '[]'::jsonb,
  equipment_items JSONB DEFAULT '[]'::jsonb,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  valid_until DATE,
  notes TEXT,
  terms TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  viewed_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quotes in their account" ON quotes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage quotes in their account" ON quotes FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 5. ORDERS
-- =====================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  order_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  venue_address TEXT,
  venue_lat DECIMAL(10,8),
  venue_lng DECIMAL(11,8),
  guest_count INTEGER NOT NULL,
  menu_items JSONB DEFAULT '[]'::jsonb,
  equipment_items JSONB DEFAULT '[]'::jsonb,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
  amount_paid DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'preparing', 'ready', 'in_transit', 'delivered', 'completed', 'cancelled')),
  assigned_driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_chef_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'picked_up', 'in_transit', 'delivered', 'collected')),
  pickup_time TIMESTAMP WITH TIME ZONE,
  delivery_time TIMESTAMP WITH TIME ZONE,
  collection_time TIMESTAMP WITH TIME ZONE,
  special_instructions TEXT,
  internal_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view orders in their account" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage orders in their account" ON orders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Drivers can view assigned orders" ON orders FOR SELECT USING (auth.uid() = assigned_driver_id);
CREATE POLICY "Chefs can view assigned orders" ON orders FOR SELECT USING (auth.uid() = assigned_chef_id);

-- =====================================================
-- 6. INVENTORY MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('meat', 'vegetables', 'spices', 'dairy', 'dry_goods', 'beverages', 'other')),
  unit TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 0,
  minimum_quantity DECIMAL(10,2) DEFAULT 0,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  supplier TEXT,
  shelf_life_days INTEGER,
  purchase_date DATE,
  expiry_date DATE,
  is_perishable BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'low_stock', 'out_of_stock', 'expired')),
  last_restocked DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory in their account" ON inventory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage inventory in their account" ON inventory FOR ALL USING (auth.uid() = user_id);

-- Inventory batches (FIFO tracking)
CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  batch_code TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  received_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  use_by_date DATE,
  storage_location TEXT,
  storage_temp_celsius DECIMAL(4,1),
  supplier_name TEXT,
  cost_per_unit DECIMAL(10,2),
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'expired', 'wasted')),
  preparer_initials TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company inventory" ON inventory_batches FOR SELECT USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Users can manage their company inventory" ON inventory_batches FOR ALL USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- Storage locations
CREATE TABLE IF NOT EXISTS storage_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cold', 'freezer', 'dry')),
  capacity_liters DECIMAL(10,2),
  current_usage_liters DECIMAL(10,2) DEFAULT 0,
  min_temp_celsius DECIMAL(4,1),
  max_temp_celsius DECIMAL(4,1),
  location_notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;

-- Temperature logs
CREATE TABLE IF NOT EXISTS temperature_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_location_id UUID REFERENCES storage_locations(id) ON DELETE CASCADE,
  recorded_temp_celsius DECIMAL(4,1) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recorded_by UUID REFERENCES profiles(id),
  alert_triggered BOOLEAN DEFAULT false,
  notes TEXT
);

ALTER TABLE temperature_logs ENABLE ROW LEVEL SECURITY;

-- Waste tracking
CREATE TABLE IF NOT EXISTS waste_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL,
  cost_value DECIMAL(10,2),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  logged_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. EQUIPMENT MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cutlery', 'crockery', 'glassware', 'chafing_dishes', 'serving_platters', 'cooking_equipment', 'furniture', 'decor', 'other')),
  quantity INTEGER DEFAULT 0,
  available_quantity INTEGER DEFAULT 0,
  condition TEXT DEFAULT 'good' CHECK (condition IN ('excellent', 'good', 'fair', 'needs_repair', 'damaged')),
  cleaning_time_hours DECIMAL(4,2) DEFAULT 2.0,
  replacement_cost DECIMAL(10,2),
  last_inspection DATE,
  next_available_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment in their account" ON equipment FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage equipment in their account" ON equipment FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS equipment_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  booked_from TIMESTAMP WITH TIME ZONE NOT NULL,
  booked_until TIMESTAMP WITH TIME ZONE NOT NULL,
  available_from TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'booked' CHECK (status IN ('booked', 'in_use', 'returned', 'cleaning', 'available')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment bookings" ON equipment_bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage equipment bookings" ON equipment_bookings FOR ALL USING (auth.uid() = user_id);

-- Equipment shortage flags
CREATE TABLE IF NOT EXISTS equipment_shortage_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_booking_id UUID NOT NULL REFERENCES equipment_bookings(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT,
  equipment_name TEXT NOT NULL,
  expected_quantity INTEGER NOT NULL,
  returned_quantity INTEGER NOT NULL,
  shortage_quantity INTEGER NOT NULL,
  shortage_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'investigating')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  financial_impact NUMERIC(10,2),
  admin_notes TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment_shortage_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage shortage flags in their account" ON equipment_shortage_flags FOR ALL USING (auth.uid() = user_id);

-- Equipment handover tracking
CREATE TABLE IF NOT EXISTS equipment_handovers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  from_stage TEXT NOT NULL CHECK (from_stage IN ('kitchen', 'driver', 'client', 'return', 'cleaning', 'drying', 'ready')),
  to_stage TEXT NOT NULL CHECK (to_stage IN ('kitchen', 'driver', 'client', 'return', 'cleaning', 'drying', 'ready')),
  handed_by_user_id UUID REFERENCES profiles(id),
  handed_by_name TEXT,
  received_by_user_id UUID REFERENCES profiles(id),
  received_by_name TEXT,
  quantity_sent INTEGER NOT NULL,
  quantity_received INTEGER,
  discrepancy_noted BOOLEAN DEFAULT FALSE,
  discrepancy_reason TEXT,
  handed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment_handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company handovers" ON equipment_handovers FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert handovers" ON equipment_handovers FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update handovers" ON equipment_handovers FOR UPDATE USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);

-- Equipment damages
CREATE TABLE IF NOT EXISTS equipment_damages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  handover_id UUID REFERENCES equipment_handovers(id),
  quantity_damaged INTEGER NOT NULL,
  damage_type TEXT NOT NULL CHECK (damage_type IN ('broken', 'lost', 'stolen', 'damaged')),
  damage_stage TEXT NOT NULL CHECK (damage_stage IN ('kitchen', 'driver', 'client', 'return', 'cleaning', 'drying')),
  unit_cost DECIMAL(10, 2) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  responsible_user_id UUID REFERENCES profiles(id),
  responsible_name TEXT,
  description TEXT,
  notes TEXT,
  photo_url TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment_damages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company damages" ON equipment_damages FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert damages" ON equipment_damages FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update damages" ON equipment_damages FOR UPDATE USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);

-- Equipment cleaning status
CREATE TABLE IF NOT EXISTS equipment_cleaning_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  returned_quantity INTEGER NOT NULL,
  cleaning_started_at TIMESTAMP WITH TIME ZONE,
  cleaning_completed_at TIMESTAMP WITH TIME ZONE,
  drying_started_at TIMESTAMP WITH TIME ZONE,
  drying_completed_at TIMESTAMP WITH TIME ZONE,
  ready_for_use_at TIMESTAMP WITH TIME ZONE,
  cleaned_by_user_id UUID REFERENCES profiles(id),
  verified_by_user_id UUID REFERENCES profiles(id),
  current_status TEXT NOT NULL DEFAULT 'pending' CHECK (current_status IN ('pending', 'cleaning', 'drying', 'ready', 'stored')),
  admin_notified BOOLEAN DEFAULT FALSE,
  admin_notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment_cleaning_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company cleaning status" ON equipment_cleaning_status FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert cleaning status" ON equipment_cleaning_status FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update cleaning status" ON equipment_cleaning_status FOR UPDATE USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);

-- Equipment maintenance
CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  equipment_type TEXT,
  serial_number TEXT,
  is_backup BOOLEAN DEFAULT false,
  maintenance_frequency_days INTEGER DEFAULT 90,
  last_service_date DATE,
  next_service_date DATE,
  service_provider TEXT,
  service_cost DECIMAL(10,2),
  status TEXT DEFAULT 'operational' CHECK (status IN ('operational', 'needs_service', 'broken', 'backup')),
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company equipment" ON equipment_maintenance FOR SELECT USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Users can manage their company equipment" ON equipment_maintenance FOR ALL USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- Equipment service history
CREATE TABLE IF NOT EXISTS equipment_service_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment_maintenance(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type TEXT,
  technician_name TEXT,
  cost DECIMAL(10,2),
  issues_found TEXT,
  actions_taken TEXT,
  next_service_due DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment_service_history ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 8. DRIVER MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS driver_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('delivery', 'collection', 'both')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'started', 'completed', 'cancelled')),
  accepted_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  hourly_rate DECIMAL(10,2),
  rate_per_km DECIMAL(10,2),
  calculated_hours DECIMAL(6,2),
  calculated_distance DECIMAL(10,2),
  total_earnings DECIMAL(10,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE driver_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view driver assignments" ON driver_assignments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage driver assignments" ON driver_assignments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Drivers can view their assignments" ON driver_assignments FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Drivers can update their assignments" ON driver_assignments FOR UPDATE USING (auth.uid() = driver_id);

CREATE TABLE IF NOT EXISTS gps_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES driver_assignments(id) ON DELETE CASCADE,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  speed DECIMAL(6,2),
  heading DECIMAL(5,2),
  accuracy DECIMAL(6,2),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE gps_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert their own GPS data" ON gps_tracking FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Users can view GPS tracking for their orders" ON gps_tracking FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = gps_tracking.order_id AND orders.user_id = auth.uid())
);
CREATE POLICY "Drivers can view their own GPS tracking" ON gps_tracking FOR SELECT USING (auth.uid() = driver_id);

-- =====================================================
-- 9. KITCHEN MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS kitchen_duty_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NULL REFERENCES orders(id) ON DELETE CASCADE,
  shift_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  shift_end TIMESTAMP WITH TIME ZONE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE kitchen_duty_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can create their own duty shifts" ON kitchen_duty_shifts FOR INSERT WITH CHECK (auth.uid() = staff_id);
CREATE POLICY "Staff can update their own duty shifts" ON kitchen_duty_shifts FOR UPDATE USING (auth.uid() = staff_id);
CREATE POLICY "Staff can view duty shifts in their company" ON kitchen_duty_shifts FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner', 'kitchen', 'chef'))
);
CREATE POLICY "Admins can manage all duty shifts" ON kitchen_duty_shifts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner'))
);

CREATE TABLE IF NOT EXISTS kitchen_task_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  duty_shift_id UUID NULL REFERENCES kitchen_duty_shifts(id) ON DELETE SET NULL,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('food_ready', 'cutlery_ready', 'crockery_ready', 'equipment_ready', 'plating_complete', 'ready_for_pickup', 'custom')),
  task_description TEXT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  location_lat NUMERIC(10,8) NULL,
  location_lng NUMERIC(11,8) NULL,
  photo_url TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE kitchen_task_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can create their own task completions" ON kitchen_task_completions FOR INSERT WITH CHECK (auth.uid() = staff_id);
CREATE POLICY "Staff can view task completions in their company" ON kitchen_task_completions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner', 'kitchen', 'chef'))
);
CREATE POLICY "Admins can manage all task completions" ON kitchen_task_completions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner'))
);

-- Cleaning duty logs
CREATE TABLE IF NOT EXISTS cleaning_duty_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  company_id UUID NOT NULL,
  on_duty BOOLEAN NOT NULL DEFAULT TRUE,
  duty_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  duty_ended_at TIMESTAMP WITH TIME ZONE,
  equipment_verified BOOLEAN DEFAULT FALSE,
  equipment_verified_at TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE cleaning_duty_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company duty logs" ON cleaning_duty_logs FOR SELECT USING (
  company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Users can insert duty logs" ON cleaning_duty_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update duty logs" ON cleaning_duty_logs FOR UPDATE USING (user_id = auth.uid());

-- =====================================================
-- 10. MENU & RECIPE MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  base_cost DECIMAL(10,2),
  selling_price DECIMAL(10,2),
  profit_margin DECIMAL(5,2),
  prep_time_minutes INTEGER,
  serves INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company menu items" ON menu_items FOR SELECT USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Users can manage their company menu items" ON menu_items FOR ALL USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  prep_steps JSONB,
  cooking_steps JSONB,
  plating_notes TEXT,
  batch_size INTEGER DEFAULT 1,
  cook_time_minutes INTEGER,
  holding_temp_celsius DECIMAL(4,1),
  shelf_life_hours INTEGER,
  active BOOLEAN DEFAULT true,
  locked BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company recipes" ON recipes FOR SELECT USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Users can manage their company recipes" ON recipes FOR ALL USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  cost_per_unit DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS allergens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  icon_name TEXT,
  severity TEXT DEFAULT 'high',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view allergens" ON allergens FOR SELECT USING (true);

-- Insert standard allergens
INSERT INTO allergens (name, icon_name, severity) VALUES
  ('Milk & Dairy', 'milk', 'high'),
  ('Eggs', 'egg', 'high'),
  ('Fish', 'fish', 'high'),
  ('Shellfish', 'shell', 'high'),
  ('Tree Nuts', 'nut', 'high'),
  ('Peanuts', 'peanut', 'high'),
  ('Wheat & Gluten', 'wheat', 'high'),
  ('Soybeans', 'bean', 'medium'),
  ('Sesame', 'sesame', 'medium'),
  ('Celery', 'leaf', 'low'),
  ('Mustard', 'mustard', 'low'),
  ('Sulphites', 'chemistry', 'low')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS recipe_allergens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  allergen_id UUID NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recipe_id, allergen_id)
);

ALTER TABLE recipe_allergens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ingredient_substitutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_ingredient TEXT NOT NULL,
  substitute_ingredient TEXT NOT NULL,
  ratio TEXT,
  cost_impact DECIMAL(10,2),
  allergen_impact TEXT,
  taste_impact TEXT,
  tested BOOLEAN DEFAULT false,
  approved BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ingredient_substitutions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 11. SUPPLIER MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  priority INTEGER DEFAULT 2,
  delivery_days TEXT,
  lead_time_hours INTEGER,
  minimum_order DECIMAL(10,2),
  rating DECIMAL(2,1),
  reliability_score INTEGER,
  quality_score INTEGER,
  active BOOLEAN DEFAULT true,
  emergency_contact BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company suppliers" ON suppliers FOR SELECT USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Users can manage their company suppliers" ON suppliers FOR ALL USING (
  company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL,
  price_per_unit DECIMAL(10,2) NOT NULL,
  minimum_order_quantity DECIMAL(10,2),
  traceability_cert TEXT,
  active BOOLEAN DEFAULT true,
  last_price_update DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS supplier_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  supplier TEXT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit TEXT NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  last_purchased DATE,
  purchase_count INTEGER DEFAULT 1,
  average_price DECIMAL(10,2),
  lowest_price DECIMAL(10,2),
  highest_price DECIMAL(10,2),
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  delivery_rating INTEGER CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE supplier_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view supplier prices" ON supplier_prices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage supplier prices" ON supplier_prices FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 12. SHOPPING MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  list_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  total_estimated_cost DECIMAL(10,2) DEFAULT 0,
  total_actual_cost DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shopping lists" ON shopping_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage shopping lists" ON shopping_lists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Shopping team can view assigned lists" ON shopping_lists FOR SELECT USING (auth.uid() = assigned_to);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit TEXT NOT NULL,
  estimated_cost DECIMAL(10,2),
  actual_cost DECIMAL(10,2),
  supplier TEXT,
  purchased BOOLEAN DEFAULT false,
  purchased_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shopping list items" ON shopping_list_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM shopping_lists WHERE shopping_lists.id = shopping_list_items.shopping_list_id AND shopping_lists.user_id = auth.uid())
);
CREATE POLICY "Users can manage shopping list items" ON shopping_list_items FOR ALL USING (
  EXISTS (SELECT 1 FROM shopping_lists WHERE shopping_lists.id = shopping_list_items.shopping_list_id AND shopping_lists.user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS purchase_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  shopping_list_id UUID REFERENCES shopping_lists(id) ON DELETE SET NULL,
  supplier TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  receipt_image_url TEXT,
  receipt_data JSONB DEFAULT '{}'::jsonb,
  items JSONB DEFAULT '[]'::jsonb,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE purchase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view purchase history" ON purchase_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage purchase history" ON purchase_history FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 13. PAYMENT MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('order', 'subscription', 'deposit', 'refund')),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  payment_method TEXT CHECK (payment_method IN ('payfast', 'stripe', 'paypal', 'cash', 'eft', 'card')),
  gateway TEXT,
  transaction_id TEXT,
  gateway_reference TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their payments" ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their payments" ON payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their payments" ON payments FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS payment_gateways (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway_name TEXT NOT NULL,
  gateway_type TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  is_test_mode BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  credentials JSONB DEFAULT '{}',
  supported_currencies TEXT[] DEFAULT '{"ZAR"}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their payment gateways" ON payment_gateways FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 14. EMAIL AUTOMATION
-- =====================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL CHECK (template_type IN (
    'quote_initial', 'quote_follow_up_1', 'quote_follow_up_2', 'quote_accepted',
    'payment_received', 'order_confirmation', 'reminder_14_days', 'reminder_7_days',
    'reminder_3_days', 'reminder_1_day', 'order_completed', 'review_request',
    'after_sales_2_months', 'after_sales_4_months', 'after_sales_6_months',
    'after_sales_8_months', 'after_sales_10_months', 'after_sales_12_months'
  )),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, template_type)
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their email templates" ON email_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their email templates" ON email_templates FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS email_automation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  template_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked')),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE email_automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their email logs" ON email_automation_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert email logs" ON email_automation_log FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'smtp',
  smtp_host TEXT,
  smtp_port TEXT DEFAULT '587',
  smtp_user TEXT,
  smtp_password TEXT,
  from_email TEXT,
  from_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email settings" ON email_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own email settings" ON email_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own email settings" ON email_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own email settings" ON email_settings FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, rule_id)
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own automation rules" ON automation_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own automation rules" ON automation_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own automation rules" ON automation_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own automation rules" ON automation_rules FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS after_sales_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  email_number INTEGER NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_email_number CHECK (email_number BETWEEN 1 AND 6)
);

ALTER TABLE after_sales_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their after sales emails" ON after_sales_emails FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 15. COMPLAINTS & NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT,
  complaint_type TEXT NOT NULL CHECK (complaint_type IN ('food_quality', 'late_delivery', 'missing_items', 'equipment_issue', 'service_issue', 'other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  description TEXT NOT NULL,
  resolution_notes TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view complaints for their orders" ON complaints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage complaints" ON complaints FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'order_assigned', 'order_status_change', 'payment_received', 'delivery_started',
    'delivery_completed', 'complaint_received', 'inventory_low', 'equipment_needed',
    'driver_payment', 'review_request', 'system_alert'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications" ON notifications FOR SELECT USING (auth.uid() = recipient_id);
CREATE POLICY "Users can update their notifications" ON notifications FOR UPDATE USING (auth.uid() = recipient_id);
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);

-- =====================================================
-- 16. ACTIVITY LOG & SAFETY
-- =====================================================

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view activity in their account" ON activity_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert activity logs" ON activity_log FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS safety_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  check_date DATE NOT NULL,
  inspector_name TEXT,
  certification_number TEXT,
  expiry_date DATE,
  passed BOOLEAN NOT NULL,
  issues_found TEXT,
  actions_required TEXT,
  next_check_due DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE safety_checks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 17. STAFF MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS staff_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('kitchen', 'driver', 'cleaning', 'shopping', 'admin')),
  invitation_token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(company_id, email)
);

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view their invitations" ON staff_invitations FOR SELECT USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Company admins can create invitations" ON staff_invitations FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Company admins can update their invitations" ON staff_invitations FOR UPDATE USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Anyone can accept invitations with valid token" ON staff_invitations FOR UPDATE USING (
  status = 'pending' AND expires_at > NOW()
);
CREATE POLICY "Company admins can delete their invitations" ON staff_invitations FOR DELETE USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- =====================================================
-- 18. CMS (Blog & Pages)
-- =====================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  published_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  featured_image TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  meta_title TEXT,
  meta_description TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  read_time_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published blog posts" ON blog_posts FOR SELECT USING (is_published = TRUE);
CREATE POLICY "Authenticated users can manage blog posts" ON blog_posts FOR ALL USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS cms_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  is_published BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published pages" ON cms_pages FOR SELECT USING (is_published = TRUE);
CREATE POLICY "Authenticated users can manage pages" ON cms_pages FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- 19. INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_event_date ON orders(event_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_event_date ON quotes(event_date);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_equipment_user_id ON equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_gps_tracking_order_id ON gps_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_gps_tracking_driver_id ON gps_tracking(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_driver_id ON driver_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_menu_items_company ON menu_items(company_id);
CREATE INDEX IF NOT EXISTS idx_recipes_company ON recipes(company_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_company_expiry ON inventory_batches(company_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_status ON inventory_batches(status);
CREATE INDEX IF NOT EXISTS idx_temperature_logs_location_date ON temperature_logs(storage_location_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_waste_logs_company_date ON waste_logs(company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_company ON equipment_maintenance(company_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_staff ON kitchen_duty_shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_active ON kitchen_duty_shifts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_order ON kitchen_duty_shifts(order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_staff ON kitchen_task_completions(staff_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_order ON kitchen_task_completions(order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_type ON kitchen_task_completions(task_type);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_completed ON kitchen_task_completions(completed_at);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_status ON equipment_shortage_flags(status);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_user_id ON equipment_shortage_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_order_id ON equipment_shortage_flags(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_priority ON equipment_shortage_flags(priority);
CREATE INDEX IF NOT EXISTS idx_equipment_handovers_order ON equipment_handovers(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_handovers_equipment ON equipment_handovers(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_damages_order ON equipment_damages(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_damages_equipment ON equipment_damages(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_damages_created ON equipment_damages(created_at);
CREATE INDEX IF NOT EXISTS idx_cleaning_duty_logs_user ON cleaning_duty_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_duty_logs_company ON cleaning_duty_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_cleaning_status_order ON equipment_cleaning_status(order_id);
CREATE INDEX IF NOT EXISTS idx_after_sales_emails_scheduled ON after_sales_emails(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_active ON payment_gateways(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_email_settings_user_id ON email_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_user_id ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON automation_rules(trigger);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_token ON staff_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_company_email ON staff_invitations(company_id, email);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON staff_invitations(status);

-- =====================================================
-- 20. TRIGGERS & FUNCTIONS
-- =====================================================

-- Auto-confirm user emails on signup
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email_confirmed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_user();

-- Create profile for new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, currency, phone_number, company_name, subscription_plan, subscription_status, trial_ends_at)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'currency',
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'company_name',
    'trial',
    'trial',
    (now() + interval '14 days')
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Calculate driver earnings
CREATE OR REPLACE FUNCTION calculate_driver_earnings()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    NEW.calculated_hours = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 3600;
    NEW.total_earnings = (COALESCE(NEW.hourly_rate, 0) * COALESCE(NEW.calculated_hours, 0)) + 
                        (COALESCE(NEW.rate_per_km, 0) * COALESCE(NEW.calculated_distance, 0));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_driver_earnings ON driver_assignments;
CREATE TRIGGER trigger_calculate_driver_earnings
  BEFORE UPDATE ON driver_assignments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_driver_earnings();

-- Update equipment availability after cleaning
CREATE OR REPLACE FUNCTION update_equipment_availability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'returned' AND OLD.status != 'returned' THEN
    UPDATE equipment 
    SET available_quantity = available_quantity + NEW.quantity,
        next_available_at = NOW() + (cleaning_time_hours || ' hours')::INTERVAL
    WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_equipment_availability ON equipment_bookings;
CREATE TRIGGER trigger_update_equipment_availability
  AFTER UPDATE ON equipment_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_availability();

-- Update equipment shortage flags updated_at
CREATE OR REPLACE FUNCTION update_equipment_shortage_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_equipment_shortage_flags_updated_at ON equipment_shortage_flags;
CREATE TRIGGER trigger_update_equipment_shortage_flags_updated_at
  BEFORE UPDATE ON equipment_shortage_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_shortage_flags_updated_at();

-- =====================================================
-- END OF DATABASE DDL
-- =====================================================

-- Update existing unconfirmed users (if migrating)
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- Comments
COMMENT ON TABLE profiles IS 'User profiles extending auth.users with company and role information';
COMMENT ON TABLE companies IS 'Company/organization accounts for multi-tenant support';
COMMENT ON TABLE orders IS 'Catering orders with full delivery and payment tracking';
COMMENT ON TABLE equipment IS 'Equipment inventory with availability tracking';
COMMENT ON TABLE staff_invitations IS 'Tracks staff member invitations sent by company admins';
COMMENT ON FUNCTION public.handle_new_user() IS 'Creates a profile for a new user and sets up a 14-day trial';
