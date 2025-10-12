-- =====================================================
-- CATERING MANAGEMENT PLATFORM - DATABASE SCHEMA
-- =====================================================

-- 1. EXTEND PROFILES TABLE
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ZAR';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'client';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_plan TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days');
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add check constraint for roles
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'client', 'driver', 'kitchen', 'cleaning', 'shopping'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add check constraint for subscription status
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_status_check 
  CHECK (subscription_status IN ('trial', 'active', 'cancelled', 'expired', 'payment_failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. SUBSCRIPTIONS TABLE
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

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own subscriptions" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscriptions" ON subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- 3. REGIONS TABLE (for multi-region support)
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

-- 4. LEADS TABLE
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

-- 5. QUOTES TABLE
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

-- 6. ORDERS TABLE
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

-- 7. INVENTORY TABLE
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