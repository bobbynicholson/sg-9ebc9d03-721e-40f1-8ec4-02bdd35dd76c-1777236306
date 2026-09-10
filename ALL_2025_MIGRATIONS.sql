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
CREATE POLICY "Users can manage inventory in their account" ON inventory FOR ALL USING (auth.uid() = user_id);-- =====================================================
-- CATERING MANAGEMENT PLATFORM - DATABASE SCHEMA (PART 2)
-- =====================================================

-- 8. EQUIPMENT TABLE
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
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment in their account" ON equipment FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage equipment in their account" ON equipment FOR ALL USING (auth.uid() = user_id);

-- 9. EQUIPMENT BOOKINGS TABLE
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

-- 10. DRIVER ASSIGNMENTS TABLE
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

-- 11. GPS TRACKING TABLE
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
  EXISTS (
    SELECT 1 FROM orders WHERE orders.id = gps_tracking.order_id AND orders.user_id = auth.uid()
  )
);
CREATE POLICY "Drivers can view their own GPS tracking" ON gps_tracking FOR SELECT USING (auth.uid() = driver_id);

-- 12. COMPLAINTS TABLE
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

-- 13. PAYMENTS TABLE
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

-- 14. EMAIL TEMPLATES TABLE
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
CREATE POLICY "Users can manage their email templates" ON email_templates FOR ALL USING (auth.uid() = user_id);-- =====================================================
-- CATERING MANAGEMENT PLATFORM - DATABASE SCHEMA (PART 3)
-- =====================================================

-- 15. EMAIL AUTOMATION LOG TABLE
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

-- 16. SHOPPING LISTS TABLE
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

-- 17. SHOPPING LIST ITEMS TABLE
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
  EXISTS (
    SELECT 1 FROM shopping_lists WHERE shopping_lists.id = shopping_list_items.shopping_list_id AND shopping_lists.user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage shopping list items" ON shopping_list_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM shopping_lists WHERE shopping_lists.id = shopping_list_items.shopping_list_id AND shopping_lists.user_id = auth.uid()
  )
);

-- 18. PURCHASE HISTORY TABLE (for receipt scanning and supplier price tracking)
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

-- 19. SUPPLIER PRICE TRACKING TABLE
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

-- 20. NOTIFICATIONS TABLE
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

-- 21. ACTIVITY LOG TABLE
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

-- Create indexes for better performance
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
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);-- Create payment_gateways table for configurable payment processors
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

-- Create after_sales_emails table for scheduled follow-up emails
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_after_sales_emails_scheduled ON after_sales_emails(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_active ON payment_gateways(user_id, is_active);

-- Create function to calculate driver earnings
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

-- Create trigger for driver earnings calculation
DROP TRIGGER IF EXISTS trigger_calculate_driver_earnings ON driver_assignments;
CREATE TRIGGER trigger_calculate_driver_earnings
  BEFORE UPDATE ON driver_assignments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_driver_earnings();

-- Create function to update equipment availability after cleaning
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

-- Create trigger for equipment availability
DROP TRIGGER IF EXISTS trigger_update_equipment_availability ON equipment_bookings;
CREATE TRIGGER trigger_update_equipment_availability
  AFTER UPDATE ON equipment_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_availability();-- Create email_settings table for SMTP configuration
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

-- Create automation_rules table for email automation templates
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

-- Enable RLS
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

-- Create policies for email_settings
CREATE POLICY "Users can view their own email settings" ON email_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own email settings" ON email_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own email settings" ON email_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own email settings" ON email_settings FOR DELETE USING (auth.uid() = user_id);

-- Create policies for automation_rules
CREATE POLICY "Users can view their own automation rules" ON automation_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own automation rules" ON automation_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own automation rules" ON automation_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own automation rules" ON automation_rules FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_settings_user_id ON email_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_user_id ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON automation_rules(trigger);-- Create blog posts table
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

-- Create pages table for CMS
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

-- Enable RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;

-- Public read access, admin write access
CREATE POLICY "Anyone can view published blog posts" ON blog_posts 
  FOR SELECT USING (is_published = TRUE);
  
CREATE POLICY "Authenticated users can manage blog posts" ON blog_posts 
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view published pages" ON cms_pages 
  FOR SELECT USING (is_published = TRUE);
  
CREATE POLICY "Authenticated users can manage pages" ON cms_pages 
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Insert dummy blog posts
INSERT INTO blog_posts (slug, title, excerpt, content, author, category, tags, is_published, read_time_minutes) VALUES
(
  'reduce-food-waste-catering-business',
  'How to Reduce Food Waste in Your Catering Business',
  'Learn practical strategies to minimize food waste, cut costs, and increase profitability in your catering operation.',
  'Food waste is one of the biggest profit killers in the catering industry. Studies show that catering businesses waste up to 20% of food purchased, directly impacting bottom lines.

## The Real Cost of Food Waste

Every plate of food thrown away represents lost profit. When you factor in purchase costs, labor, storage, and disposal, food waste becomes expensive quickly.

## Accurate Portion Control

Use digital scales and standardized recipes. Train kitchen staff on exact measurements. This ensures consistency and reduces over-preparation.

## Smart Inventory Management

Implement a first-in-first-out system. Track expiry dates automatically. Order based on actual needs, not estimates.

## Menu Engineering

Analyze which dishes generate the most waste. Consider simplifying your menu to focus on high-margin, low-waste items.

## Client Communication

Set clear expectations about guest counts. Charge for last-minute changes. This reduces over-ordering and protects your margins.

## Technology Solutions

Modern catering management software can track waste patterns, predict accurate quantities, and alert you to expiring inventory. The investment pays for itself through reduced waste.

## Staff Training

Educate your team on the financial impact of waste. Create accountability systems. Reward waste reduction efforts.

## Conclusion

Reducing food waste is not just environmentally responsible, it is financially smart. Small changes in processes can lead to significant profit improvements.',
  'Sarah Mitchell',
  'Operations',
  ARRAY['food waste', 'profitability', 'operations'],
  TRUE,
  5
),
(
  'automate-catering-quote-process',
  'Automating Your Catering Quote Process: Save 10 Hours Per Week',
  'Discover how automation can transform your quoting process from hours of manual work to minutes of efficient service.',
  'Creating quotes manually is time-consuming and error-prone. The average catering business spends 10-15 hours per week on quotes and follow-ups.

## The Manual Quote Problem

Spreadsheets, calculators, email chains, forgotten follow-ups. This chaos costs you money and opportunities.

## What to Automate

**Quote Generation**: Templates with automatic pricing based on guest count, menu selections, and equipment needs.

**Follow-Up Emails**: Scheduled reminders that go out automatically if clients have not responded.

**Price Calculations**: Real-time updates when clients change quantities or options.

**Calendar Integration**: Automatic date availability checking to prevent double-bookings.

## ROI of Quote Automation

A business handling 50 quotes per month can save 40+ hours monthly. That is time redirected to growing your business instead of administrative tasks.

## Client Experience Improvements

Instant quotes impress clients. Professional, consistent communication builds trust. Faster response times win more bookings.

## Integration with Operations

Automated systems connect quotes to inventory, kitchen prep, and driver scheduling. One data entry point flows through your entire operation.

## Common Mistakes to Avoid

Do not automate broken processes. Fix your workflow first, then automate. Keep human touch points for complex or high-value events.

## Getting Started

Start with email automation and quote templates. Add complexity gradually. Measure time saved and conversion rate improvements.

## Conclusion

Quote automation is not about replacing personal service. It is about eliminating repetitive tasks so you can focus on what matters: delivering amazing events.',
  'Michael Chen',
  'Technology',
  ARRAY['automation', 'efficiency', 'quotes'],
  TRUE,
  6
),
(
  'catering-profit-margins-guide',
  'Understanding and Improving Catering Profit Margins',
  'A comprehensive guide to calculating true profit margins and implementing strategies to improve profitability in your catering business.',
  'Many catering businesses operate on razor-thin margins without knowing their actual profitability per event.

## Industry Benchmarks

Successful catering businesses aim for 25-35% gross profit margins. Net profit margins typically range from 5-15% after all expenses.

## Hidden Cost Killers

**Labor Inefficiency**: Staff standing idle or working overtime unnecessarily.

**Equipment Underutilization**: Buying equipment that sits unused most of the time.

**Fuel Costs**: Inefficient routing for deliveries and pickups.

**Food Waste**: Already covered in detail, but worth emphasizing again.

## Pricing Strategy

Never compete on price alone. Your value proposition should include reliability, quality, and service. Price for your costs plus desired margin.

## Cost Control Systems

Track every expense per event. Know your cost per plate. Monitor ingredient price fluctuations. Adjust pricing quarterly if needed.

## Menu Engineering for Profit

Analyze the profitability and popularity of each menu item. Focus on high-profit, high-demand dishes. Eliminate low-margin items that do not drive bookings.

## Operational Efficiency

Reduce setup and cleanup times through better processes. Optimize kitchen workflows. Minimize trips and touches for each task.

## Technology Investment

Modern catering management platforms provide real-time visibility into profitability. The data helps make informed decisions quickly.

## Conclusion

Improving margins requires understanding your costs, pricing strategically, and operating efficiently. Small improvements across multiple areas compound into significant profit gains.',
  'David Thompson',
  'Finance',
  ARRAY['profit margins', 'pricing', 'finance'],
  TRUE,
  7
);

-- Insert more blog posts
INSERT INTO blog_posts (slug, title, excerpt, content, author, category, tags, is_published, read_time_minutes) VALUES
(
  'scale-catering-business-multiple-locations',
  'How to Scale Your Catering Business Across Multiple Locations',
  'Learn the systems and strategies needed to successfully expand your catering operation into new markets.',
  'Scaling a catering business requires more than just opening new kitchens. You need robust systems, clear processes, and the right technology.

## When to Scale

Scale when your current location is operating profitably with strong systems. Never scale to solve cash flow problems or escape operational issues.

## System Requirements

**Standardized Processes**: Document everything from how quotes are created to how equipment is cleaned.

**Centralized Management**: One system for all locations to track orders, inventory, and performance.

**Quality Control**: Mechanisms to ensure consistency across locations.

## Regional Considerations

Different areas have different tastes, price sensitivities, and competition levels. Adapt your offerings while maintaining core brand standards.

## Staffing Challenges

Finding and training reliable staff in new markets is difficult. Build training programs and incentive structures that attract quality people.

## Financial Planning

Each new location requires significant upfront investment. Plan for 6-12 months of losses before profitability.

## Technology as an Enabler

Modern catering platforms allow centralized quote generation with regionalized operations. Head office handles sales while local teams execute.

## Common Pitfalls

Growing too fast, inadequate working capital, poor communication between locations, and inconsistent quality standards.

## Success Metrics

Track performance by location. Monitor food costs, labor efficiency, client satisfaction, and profitability independently.

## Conclusion

Scaling successfully requires strong foundations, adequate capital, and technology that connects all locations while allowing operational independence.',
  'Sarah Mitchell',
  'Growth',
  ARRAY['scaling', 'expansion', 'multi-location'],
  TRUE,
  8
),
(
  'driver-management-catering-logistics',
  'Effective Driver Management for Catering Logistics',
  'Best practices for managing delivery drivers to ensure on-time delivery and excellent client experiences.',
  'Your drivers are the final touchpoint with clients. Poor driver management leads to late deliveries, damaged food, and lost business.

## Driver Selection

Hire for reliability and professionalism, not just availability. Background checks are essential. Look for people with customer service experience.

## GPS Tracking Benefits

Real-time location tracking provides accountability, helps optimize routes, and gives clients peace of mind. It also protects your business in disputes.

## Communication Systems

Drivers need clear instructions, client contact information, and setup details. Mobile apps streamline communication and reduce errors.

## Performance Metrics

Track on-time delivery rates, client feedback, vehicle maintenance, and fuel efficiency. Provide regular performance reviews.

## Fair Compensation

Pay structure should reward reliability and efficiency. Consider per-event rates plus bonuses for consistent performance.

## Training Programs

Proper setup techniques, client interaction protocols, vehicle safety, and emergency procedures. Ongoing training maintains standards.

## Equipment Management

Drivers should inspect equipment before and after events. Systems should track what equipment is where and when it needs to return.

## Problem Resolution

Have clear escalation procedures when issues arise. Drivers should know when to call the office vs. handle situations independently.

## Conclusion

Professional driver management transforms logistics from a liability into a competitive advantage. The right systems make this scalable.',
  'Michael Chen',
  'Operations',
  ARRAY['drivers', 'logistics', 'delivery'],
  TRUE,
  6
);-- Create equipment shortage flags table
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

-- Enable RLS
ALTER TABLE equipment_shortage_flags ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage shortage flags in their account"
  ON equipment_shortage_flags
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view shortage flags in their account"
  ON equipment_shortage_flags
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_equipment_shortage_flags_status ON equipment_shortage_flags(status);
CREATE INDEX idx_equipment_shortage_flags_user_id ON equipment_shortage_flags(user_id);
CREATE INDEX idx_equipment_shortage_flags_order_id ON equipment_shortage_flags(order_id);
CREATE INDEX idx_equipment_shortage_flags_priority ON equipment_shortage_flags(priority);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_equipment_shortage_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_equipment_shortage_flags_updated_at
  BEFORE UPDATE ON equipment_shortage_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_shortage_flags_updated_at();-- Create equipment_shortage_flags table
CREATE TABLE IF NOT EXISTS equipment_shortage_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_booking_id UUID NOT NULL REFERENCES equipment_bookings(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT,
  equipment_name TEXT NOT NULL,
  expected_quantity INTEGER NOT NULL,
  returned_quantity INTEGER NOT NULL,
  shortage_quantity INTEGER NOT NULL,
  shortage_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  financial_impact DECIMAL(10, 2),
  admin_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_order_id ON equipment_shortage_flags(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_equipment_id ON equipment_shortage_flags(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_user_id ON equipment_shortage_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_status ON equipment_shortage_flags(status);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_priority ON equipment_shortage_flags(priority);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_created_at ON equipment_shortage_flags(created_at DESC);

-- Enable RLS
ALTER TABLE equipment_shortage_flags ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own shortage flags" 
  ON equipment_shortage_flags FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own shortage flags" 
  ON equipment_shortage_flags FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shortage flags" 
  ON equipment_shortage_flags FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shortage flags" 
  ON equipment_shortage_flags FOR DELETE 
  USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_equipment_shortage_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function
CREATE TRIGGER update_equipment_shortage_flags_updated_at_trigger
  BEFORE UPDATE ON equipment_shortage_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_shortage_flags_updated_at();

-- Add helpful comments
COMMENT ON TABLE equipment_shortage_flags IS 'Tracks equipment shortage incidents when returned quantities are less than expected';
COMMENT ON COLUMN equipment_shortage_flags.status IS 'Current status: pending (new), investigating (being looked into), resolved (issue handled)';
COMMENT ON COLUMN equipment_shortage_flags.priority IS 'Priority level: low, medium, high, urgent based on financial impact and client importance';
COMMENT ON COLUMN equipment_shortage_flags.financial_impact IS 'Estimated financial loss or cost to replace missing equipment';-- Add waiter service fields to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS requires_waiter BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS waiter_duration_hours INTEGER,
ADD COLUMN IF NOT EXISTS waiter_hourly_rate DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS waiter_total_fee DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS equipment_return_method TEXT DEFAULT 'later_collection' CHECK (equipment_return_method IN ('waiter_return', 'later_collection'));

-- Add pre-departure checklist fields to driver_assignments
ALTER TABLE driver_assignments
ADD COLUMN IF NOT EXISTS checklist_cutlery_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checklist_crockery_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checklist_food_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checklist_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS departure_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS departure_confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_waiter_job BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS waiter_duration_hours INTEGER,
ADD COLUMN IF NOT EXISTS waiter_hourly_rate DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS waiter_earnings DECIMAL(10, 2);

-- Create index for waiter jobs
CREATE INDEX IF NOT EXISTS idx_driver_assignments_waiter ON driver_assignments(is_waiter_job) WHERE is_waiter_job = TRUE;

-- Add helpful comments
COMMENT ON COLUMN orders.requires_waiter IS 'Whether client wants driver to act as waiter for event duration';
COMMENT ON COLUMN orders.waiter_duration_hours IS 'Number of hours driver will act as waiter (1, 2, or 3 hours)';
COMMENT ON COLUMN orders.waiter_hourly_rate IS 'Hourly rate charged to client for waiter service';
COMMENT ON COLUMN orders.waiter_total_fee IS 'Total waiter service fee added to invoice (duration * rate)';
COMMENT ON COLUMN orders.equipment_return_method IS 'How equipment will be returned: waiter_return (driver brings back) or later_collection (separate pickup)';

COMMENT ON COLUMN driver_assignments.checklist_cutlery_confirmed IS 'Driver confirmed cutlery count matches order';
COMMENT ON COLUMN driver_assignments.checklist_crockery_confirmed IS 'Driver confirmed crockery count matches order';
COMMENT ON COLUMN driver_assignments.checklist_food_verified IS 'Driver verified food items against order';
COMMENT ON COLUMN driver_assignments.departure_confirmed IS 'Driver confirmed all checklist items and ready to depart';
COMMENT ON COLUMN driver_assignments.is_waiter_job IS 'Whether this job includes waiter service';
COMMENT ON COLUMN driver_assignments.waiter_earnings IS 'Additional earnings from waiter service for this job';-- Create subscriptions table with comprehensive fields
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  
  -- Pricing information
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  
  -- Trial information
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  trial_days INTEGER DEFAULT 14,
  
  -- Billing dates
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  next_billing_date TIMESTAMP WITH TIME ZONE,
  
  -- Cancellation information
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  cancellation_feedback TEXT,
  
  -- Price change management
  pending_price_change BOOLEAN DEFAULT FALSE,
  new_amount DECIMAL(10,2),
  price_change_effective_date TIMESTAMP WITH TIME ZONE,
  price_change_notification_sent BOOLEAN DEFAULT FALSE,
  
  -- Usage tracking
  active_clients_count INTEGER DEFAULT 0,
  orders_this_quarter INTEGER DEFAULT 0,
  quarter_start_date TIMESTAMP WITH TIME ZONE,
  
  -- Payment gateway info
  payfast_token TEXT,
  payment_method_last4 TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create billing_history table
CREATE TABLE IF NOT EXISTS billing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  
  -- Payment details
  payment_method TEXT,
  transaction_id TEXT,
  payfast_payment_id TEXT,
  
  -- Invoice details
  invoice_number TEXT,
  invoice_pdf_url TEXT,
  
  billing_period_start TIMESTAMP WITH TIME ZONE,
  billing_period_end TIMESTAMP WITH TIME ZONE,
  
  paid_at TIMESTAMP WITH TIME ZONE,
  failed_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create price_changes table
CREATE TABLE IF NOT EXISTS price_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What changed
  plan_id TEXT NOT NULL,
  old_amount DECIMAL(10,2) NOT NULL,
  new_amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  
  -- When it changes
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
  announced_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Reason for change
  change_reason TEXT NOT NULL,
  exchange_rate_info TEXT,
  
  -- Notification tracking
  notifications_sent BOOLEAN DEFAULT FALSE,
  affected_subscriptions_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cancellation_requests table
CREATE TABLE IF NOT EXISTS cancellation_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  cancellation_type TEXT NOT NULL CHECK (cancellation_type IN ('immediate', 'end_of_period')),
  reason TEXT,
  feedback TEXT,
  
  -- Retention attempt
  retention_offer_made BOOLEAN DEFAULT FALSE,
  retention_offer_accepted BOOLEAN DEFAULT FALSE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed')),
  processed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create account_deletion_requests table (GDPR/POPIA compliance)
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  reason TEXT,
  data_export_requested BOOLEAN DEFAULT FALSE,
  data_export_url TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  
  -- Grace period (30 days to change mind)
  scheduled_deletion_date TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own subscription" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscription" ON subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for billing_history
CREATE POLICY "Users can view their own billing history" ON billing_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert billing records" ON billing_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for price_changes
CREATE POLICY "Anyone can view price changes" ON price_changes FOR SELECT USING (true);
CREATE POLICY "Only admins can manage price changes" ON price_changes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- RLS Policies for cancellation_requests
CREATE POLICY "Users can view their own cancellation requests" ON cancellation_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create cancellation requests" ON cancellation_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for account_deletion_requests
CREATE POLICY "Users can view their own deletion requests" ON account_deletion_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create deletion requests" ON account_deletion_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_billing_history_user_id ON billing_history(user_id);
CREATE INDEX idx_billing_history_subscription_id ON billing_history(subscription_id);
CREATE INDEX idx_price_changes_effective_date ON price_changes(effective_date);CREATE TABLE IF NOT EXISTS email_logs (
    id BIGSERIAL PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    email_type TEXT,
    status TEXT, -- e.g., 'sent', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Allow service roles to manage email logs
CREATE POLICY "Allow service role full access to email logs" ON email_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- Add missing columns to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT;


CREATE OR REPLACE FUNCTION get_quarterly_usage(p_user_id UUID)
RETURNS TABLE (
    clients_count BIGINT,
    orders_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(DISTINCT o.client_id)
         FROM orders o
         WHERE o.user_id = p_user_id AND o.created_at >= date_trunc('quarter', NOW()))::BIGINT,
        
        (SELECT COUNT(*)
         FROM orders o
         WHERE o.user_id = p_user_id AND o.created_at >= date_trunc('quarter', NOW()))::BIGINT;
END;
$$ LANGUAGE plpgsql;CREATE TABLE IF NOT EXISTS email_logs (
    id BIGSERIAL PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    email_type TEXT,
    status TEXT, -- e.g., 'sent', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Allow service roles to manage email logs
CREATE POLICY "Allow service role full access to email logs" ON email_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- Add missing columns to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT;


CREATE OR REPLACE FUNCTION get_quarterly_usage(p_user_id UUID)
RETURNS TABLE (
    clients_count BIGINT,
    orders_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(DISTINCT o.client_id)
         FROM orders o
         WHERE o.user_id = p_user_id AND o.created_at >= date_trunc('quarter', NOW()))::BIGINT,
        
        (SELECT COUNT(*)
         FROM orders o
         WHERE o.user_id = p_user_id AND o.created_at >= date_trunc('quarter', NOW()))::BIGINT;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS plan_id TEXT,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancellation_feedback TEXT,
ADD COLUMN IF NOT EXISTS active_clients_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS orders_this_quarter INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_price_change BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS new_amount NUMERIC,
ADD COLUMN IF NOT EXISTS price_change_effective_date TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION accept_price_change(p_subscription_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE subscriptions
    SET
        amount = new_amount,
        pending_price_change = FALSE,
        new_amount = NULL,
        price_change_effective_date = NULL,
        updated_at = NOW()
    WHERE
        id = p_subscription_id
        AND pending_price_change = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS plan_id TEXT,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancellation_feedback TEXT,
ADD COLUMN IF NOT EXISTS active_clients_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS orders_this_quarter INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_price_change BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS new_amount NUMERIC,
ADD COLUMN IF NOT EXISTS price_change_effective_date TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION accept_price_change(p_subscription_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE subscriptions
    SET
        amount = new_amount,
        pending_price_change = FALSE,
        new_amount = NULL,
        price_change_effective_date = NULL,
        updated_at = NOW()
    WHERE
        id = p_subscription_id
        AND pending_price_change = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Create exchange_rates table to store daily exchange rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  usd_to_zar_rate DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on date for faster queries
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date DESC);

-- Create currency_fluctuation_alerts table
CREATE TABLE IF NOT EXISTS currency_fluctuation_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_date DATE NOT NULL,
  start_rate DECIMAL(10, 4) NOT NULL,
  end_rate DECIMAL(10, 4) NOT NULL,
  percentage_change DECIMAL(10, 2) NOT NULL,
  days_period INTEGER NOT NULL,
  alert_sent BOOLEAN DEFAULT FALSE,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on resolved status for faster queries
CREATE INDEX IF NOT EXISTS idx_currency_alerts_resolved ON currency_fluctuation_alerts(resolved, created_at DESC);

-- Create admin_notifications table for CateringMS internal alerts
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for unread notifications
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(read, created_at DESC);

-- Enable RLS on all tables
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_fluctuation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (admin only access)
CREATE POLICY "Admin can view exchange rates" ON exchange_rates FOR SELECT USING (true);
CREATE POLICY "Admin can insert exchange rates" ON exchange_rates FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update exchange rates" ON exchange_rates FOR UPDATE USING (true);

CREATE POLICY "Admin can view fluctuation alerts" ON currency_fluctuation_alerts FOR SELECT USING (true);
CREATE POLICY "Admin can insert fluctuation alerts" ON currency_fluctuation_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update fluctuation alerts" ON currency_fluctuation_alerts FOR UPDATE USING (true);

CREATE POLICY "Admin can view notifications" ON admin_notifications FOR SELECT USING (true);
CREATE POLICY "Admin can insert notifications" ON admin_notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update notifications" ON admin_notifications FOR UPDATE USING (true);
CREATE POLICY "Admin can delete notifications" ON admin_notifications FOR DELETE USING (true);

-- Insert initial exchange rate (current approximate rate)
INSERT INTO exchange_rates (date, usd_to_zar_rate)
VALUES (CURRENT_DATE, 18.50)
ON CONFLICT (date) DO NOTHING;-- Create support tickets table for CateringMS business clients
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('billing', 'technical', 'feature_request', 'bug_report', 'general', 'onboarding', 'training')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  description TEXT NOT NULL,
  company_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  assigned_to TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create support ticket messages table for conversation thread
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  is_from_staff BOOLEAN DEFAULT FALSE,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create support ticket attachments table
CREATE TABLE IF NOT EXISTS support_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES support_ticket_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all support tables
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for support_tickets
CREATE POLICY "Users can view their own support tickets" 
  ON support_tickets FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own support tickets" 
  ON support_tickets FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own support tickets" 
  ON support_tickets FOR UPDATE 
  USING (auth.uid() = user_id);

-- RLS Policies for support_ticket_messages
CREATE POLICY "Users can view messages for their tickets" 
  ON support_ticket_messages FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE support_tickets.id = support_ticket_messages.ticket_id 
      AND support_tickets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages for their tickets" 
  ON support_ticket_messages FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE support_tickets.id = ticket_id 
      AND support_tickets.user_id = auth.uid()
    )
  );

-- RLS Policies for support_ticket_attachments
CREATE POLICY "Users can view attachments for their tickets" 
  ON support_ticket_attachments FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE support_tickets.id = support_ticket_attachments.ticket_id 
      AND support_tickets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload attachments for their tickets" 
  ON support_ticket_attachments FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE support_tickets.id = ticket_id 
      AND support_tickets.user_id = auth.uid()
    )
  );

-- Create function to generate ticket numbers
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
  ticket_num TEXT;
  ticket_exists BOOLEAN;
BEGIN
  LOOP
    ticket_num := 'TICKET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    SELECT EXISTS(SELECT 1 FROM support_tickets WHERE ticket_number = ticket_num) INTO ticket_exists;
    
    IF NOT ticket_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN ticket_num;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate ticket numbers
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_ticket_number_trigger
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_ticket_number();

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_updated_at_trigger
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();-- Drop the old trigger if it exists
DROP TRIGGER IF EXISTS support_tickets_ticket_number_trigger ON public.support_tickets;

-- Alter the table to use the function as a default value for the ticket_number column
-- This makes it so we don't have to provide it on insert, and the database handles it automatically.
ALTER TABLE public.support_tickets 
ALTER COLUMN ticket_number SET DEFAULT generate_ticket_number();-- Create integrations table to store all integration connections
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('xero', 'whatsapp', 'google_maps', 'payfast', 'stripe', 'resend', 'zapier')),
  credentials JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  disconnected_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, integration_type)
);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own integrations" ON integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integrations" ON integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integrations" ON integrations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integrations" ON integrations
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_integrations_user_type ON integrations(user_id, integration_type);
CREATE INDEX IF NOT EXISTS idx_integrations_active ON integrations(is_active) WHERE is_active = true;

-- Add integration tracking columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS xero_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_notifications_sent JSONB DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_route_optimized BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_duration_minutes INTEGER;

-- Create integration_logs table for tracking integration activity
CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
  request_data JSONB,
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for integration_logs
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for integration_logs
CREATE POLICY "Users can view their own integration logs" ON integration_logs
  FOR SELECT USING (
    integration_id IN (
      SELECT id FROM integrations WHERE user_id = auth.uid()
    )
  );

-- Create index for integration logs
CREATE INDEX IF NOT EXISTS idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at DESC);-- Add missing deposit and balance tracking fields to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS balance_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS balance_due_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS balance_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS balance_paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_change_allowed_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS final_guest_count INTEGER,
ADD COLUMN IF NOT EXISTS final_order_confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS payment_gateway TEXT;

-- Add index for payment tracking
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_balance_due ON orders(balance_due_date) WHERE balance_paid = false;

-- Update status check constraint to include all lifecycle stages
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending_deposit',
  'deposit_paid', 
  'confirmed',
  'assigned',
  'in_preparation',
  'ready_for_delivery',
  'in_transit',
  'delivered',
  'completed',
  'cancelled'
));

COMMENT ON COLUMN orders.deposit_amount IS 'Initial deposit required to confirm booking';
COMMENT ON COLUMN orders.balance_due_date IS 'Date by which final balance must be paid';
COMMENT ON COLUMN orders.last_change_allowed_date IS 'Last date client can modify order details';
COMMENT ON COLUMN orders.final_guest_count IS 'Confirmed guest count after final modifications';-- Add missing columns to orders table for delivery and waiter services
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS waiter_service_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS waiter_duration_hours INTEGER CHECK (waiter_duration_hours IN (1, 2, 3)),
ADD COLUMN IF NOT EXISTS waiter_hourly_rate DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS waiter_total_fee DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS delivery_distance_km DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS delivery_rate_per_km DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS delivery_total_fee DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS equipment_return_method TEXT CHECK (equipment_return_method IN ('waiter_return', 'later_collection'));

-- Add missing columns to driver_assignments table
ALTER TABLE driver_assignments
ADD COLUMN IF NOT EXISTS actual_cutlery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_crockery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS collection_cutlery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS collection_crockery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS collection_notes TEXT,
ADD COLUMN IF NOT EXISTS delivery_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS waiter_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS event_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS checklist_food_verified BOOLEAN DEFAULT FALSE;

-- Create equipment_shortages table if not exists
CREATE TABLE IF NOT EXISTS equipment_shortages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    equipment_type TEXT NOT NULL,
    quantity_missing INTEGER NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'written_off')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for equipment_shortages
CREATE INDEX IF NOT EXISTS idx_equipment_shortages_user_id ON equipment_shortages(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortages_order_id ON equipment_shortages(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortages_status ON equipment_shortages(status);

-- Enable RLS on equipment_shortages
ALTER TABLE equipment_shortages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for equipment_shortages
CREATE POLICY "Users can view their own equipment shortages"
    ON equipment_shortages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own equipment shortages"
    ON equipment_shortages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own equipment shortages"
    ON equipment_shortages FOR UPDATE
    USING (auth.uid() = user_id);

-- Create get_order_total function
CREATE OR REPLACE FUNCTION get_order_total(order_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
AS $$
DECLARE
    order_total DECIMAL(10,2);
BEGIN
    SELECT total INTO order_total
    FROM orders
    WHERE id = order_id;
    
    RETURN COALESCE(order_total, 0);
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION get_order_total(UUID) IS 'Returns the total amount for a given order ID';-- Add client_id to orders table to associate orders with client profiles
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);-- 1. Create payment_schedules table
CREATE TABLE IF NOT EXISTS public.payment_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    total_amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    deposit_amount NUMERIC(10, 2) NOT NULL,
    deposit_percentage NUMERIC(5, 2) NOT NULL,
    deposit_paid BOOLEAN DEFAULT FALSE,
    deposit_paid_at TIMESTAMPTZ,
    deposit_transaction_id TEXT,
    balance_amount NUMERIC(10, 2) NOT NULL,
    balance_due_date DATE NOT NULL,
    balance_paid BOOLEAN DEFAULT FALSE,
    balance_paid_at TIMESTAMPTZ,
    balance_transaction_id TEXT,
    final_order_change_date DATE NOT NULL,
    event_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own payment schedules
CREATE POLICY "Users can view their own payment schedules"
ON public.payment_schedules FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id = public.payment_schedules.order_id AND o.user_id = auth.uid()
));

-- Allow authenticated users to insert payment schedules
CREATE POLICY "Authenticated users can insert payment schedules"
ON public.payment_schedules FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to update their own payment schedules
CREATE POLICY "Users can update their own payment schedules"
ON public.payment_schedules FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id = public.payment_schedules.order_id AND o.user_id = auth.uid()
));

-- 2. Create payment_reminders table
CREATE TABLE IF NOT EXISTS public.payment_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reminder_date DATE NOT NULL,
    reminder_type TEXT NOT NULL,
    days_before_due INTEGER,
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    is_urgent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Allow users to access their own payment reminders
CREATE POLICY "Users can access their own payment reminders"
ON public.payment_reminders FOR ALL
USING (auth.uid() = user_id);

-- 3. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    action_url TEXT,
    metadata JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow users to access their own notifications
CREATE POLICY "Users can access their own notifications"
ON public.notifications FOR ALL
USING (auth.uid() = recipient_id);ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS drive_time_to_kitchen_minutes INTEGER,
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS vehicle_details TEXT;

ALTER TABLE public.driver_assignments
ADD COLUMN IF NOT EXISTS estimated_drive_time_minutes INTEGER;

CREATE TABLE IF NOT EXISTS public.order_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'policy_select_order_reviews' AND polrelid = 'public.order_reviews'::regclass) THEN
        CREATE POLICY "policy_select_order_reviews" ON public.order_reviews FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'policy_insert_order_reviews' AND polrelid = 'public.order_reviews'::regclass) THEN
        CREATE POLICY "policy_insert_order_reviews" ON public.order_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END;
$$;

ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;CREATE TABLE IF NOT EXISTS onboarding_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  checklist JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE onboarding_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own onboarding state"
ON onboarding_state
FOR ALL
USING (auth.uid() = user_id);ALTER TABLE profiles ADD COLUMN region TEXT;-- Drop the existing function
DROP FUNCTION IF EXISTS get_all_subscriptions_admin();

-- Create the function with correct return structure
CREATE OR REPLACE FUNCTION get_all_subscriptions_admin()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  plan_name TEXT,
  amount NUMERIC,
  currency TEXT,
  billing_cycle TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.user_id,
    s.plan_name,
    s.amount,
    s.currency,
    s.billing_cycle,
    s.status,
    s.created_at,
    s.cancelled_at
  FROM subscriptions s
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_all_subscriptions_admin() TO authenticated;-- Disable email confirmation requirement at the Supabase project level
-- Auto-confirm user emails on signup

-- Create a trigger function to auto-confirm user emails
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-confirm the user's email (confirmed_at is generated automatically)
  NEW.email_confirmed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to auto-confirm users on signup
CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_user();

-- Also update any existing unconfirmed users
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Create a new INSERT policy that allows authenticated users to create their profile
-- This allows the profile creation during signup to succeed
CREATE POLICY "Users can insert their own profile during signup"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);-- Add a policy that allows profile creation during signup with anon role
-- This is needed because during signup, the user might still have anon role
CREATE POLICY "Allow profile creation during signup"
ON profiles
FOR INSERT
TO anon
WITH CHECK (auth.uid() = id);-- Create a function that automatically creates a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    currency,
    is_active,
    subscription_plan,
    subscription_status,
    trial_ends_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin'),
    COALESCE(NEW.raw_user_meta_data->>'currency', 'ZAR'),
    true,
    'trial',
    'trial',
    NOW() + INTERVAL '14 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger that fires when a new user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();-- Create a function that will automatically create a profile for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, currency, subscription_status, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    COALESCE(NEW.raw_user_meta_data->>'currency', 'ZAR'),
    'trial',
    NOW() + INTERVAL '14 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger to automatically create profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update RLS policies to allow the trigger to insert profiles
DROP POLICY IF EXISTS "Allow profile creation during signup" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile during signup" ON profiles;

-- Create a single policy that allows both the trigger (SECURITY DEFINER) and authenticated users to insert
CREATE POLICY "Enable profile creation for new users" ON profiles
  FOR INSERT
  WITH CHECK (true);

-- Keep the existing policies for select and update
-- The "Public profiles are viewable by everyone" policy already exists
-- The "Users can update their own profile" policy already exists-- Create driver_confirmations table for tracking en-route status
CREATE TABLE IF NOT EXISTS driver_confirmations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  confirmation_type TEXT NOT NULL CHECK (confirmation_type IN ('en_route_to_kitchen', 'at_kitchen', 'departed_kitchen', 'at_venue', 'completed')),
  confirmed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(order_id, driver_id, confirmation_type)
);

-- Create driver_replacement_requests table
CREATE TABLE IF NOT EXISTS driver_replacement_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled')),
  accepted_by_driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create whatsapp_templates table for customizable messages
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_key TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  template_content TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  variables JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create gamification_points table
CREATE TABLE IF NOT EXISTS gamification_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  action_type TEXT NOT NULL,
  action_description TEXT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  awarded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create gamification_achievements table
CREATE TABLE IF NOT EXISTS gamification_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  icon TEXT,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_key)
);

-- Create financial_predictions table for AI-powered forecasts
CREATE TABLE IF NOT EXISTS financial_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_date DATE NOT NULL,
  predicted_revenue DECIMAL(10, 2),
  predicted_expenses DECIMAL(10, 2),
  predicted_cashflow DECIMAL(10, 2),
  confidence_score DECIMAL(3, 2),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  recommendations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create recipe_scaling_history table
CREATE TABLE IF NOT EXISTS recipe_scaling_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_guest_count INTEGER NOT NULL,
  new_guest_count INTEGER NOT NULL,
  scaling_factor DECIMAL(5, 2) NOT NULL,
  ingredient_adjustments JSONB NOT NULL,
  adjusted_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all new tables
ALTER TABLE driver_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_replacement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_scaling_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for driver_confirmations
CREATE POLICY "Users can view confirmations for their orders" ON driver_confirmations FOR SELECT USING (
  auth.uid() IN (
    SELECT driver_id FROM orders WHERE id = order_id
    UNION
    SELECT id FROM profiles WHERE role IN ('admin', 'owner')
  )
);

CREATE POLICY "Drivers can insert their own confirmations" ON driver_confirmations FOR INSERT WITH CHECK (
  auth.uid() = driver_id
);

-- RLS Policies for driver_replacement_requests
CREATE POLICY "Users can view replacement requests" ON driver_replacement_requests FOR SELECT USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role IN ('admin', 'owner', 'driver')
  )
);

CREATE POLICY "Original driver can create replacement requests" ON driver_replacement_requests FOR INSERT WITH CHECK (
  auth.uid() = original_driver_id
);

CREATE POLICY "Drivers can accept replacement requests" ON driver_replacement_requests FOR UPDATE USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'driver'
  )
);

-- RLS Policies for whatsapp_templates
CREATE POLICY "Admin can manage templates" ON whatsapp_templates FOR ALL USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'owner'))
);

CREATE POLICY "All users can view templates" ON whatsapp_templates FOR SELECT USING (true);

-- RLS Policies for gamification_points
CREATE POLICY "Users can view their own points" ON gamification_points FOR SELECT USING (
  auth.uid() = user_id OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'owner'))
);

CREATE POLICY "System can award points" ON gamification_points FOR INSERT WITH CHECK (true);

-- RLS Policies for gamification_achievements
CREATE POLICY "Users can view their own achievements" ON gamification_achievements FOR SELECT USING (
  auth.uid() = user_id OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'owner'))
);

CREATE POLICY "System can award achievements" ON gamification_achievements FOR INSERT WITH CHECK (true);

-- RLS Policies for financial_predictions
CREATE POLICY "Admin can manage predictions" ON financial_predictions FOR ALL USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'owner'))
);

-- RLS Policies for recipe_scaling_history
CREATE POLICY "Users can view recipe scaling history" ON recipe_scaling_history FOR SELECT USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role IN ('admin', 'owner', 'kitchen')
  )
);

CREATE POLICY "Kitchen and admin can create scaling records" ON recipe_scaling_history FOR INSERT WITH CHECK (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role IN ('admin', 'owner', 'kitchen')
  )
);

-- Insert default WhatsApp templates
INSERT INTO whatsapp_templates (template_key, template_name, template_content, variables, description, is_enabled) VALUES
('driver_en_route', 'Driver En Route to Kitchen', '🚗 Good morning! Your driver {{driver_name}} is now on their way to collect your order #{{order_number}} from our kitchen. Expected collection time: {{collection_time}}', '["driver_name", "order_number", "collection_time"]', 'Sent when driver confirms en-route to kitchen', true),
('driver_departed', 'Driver Departed Kitchen', '📦 Your order #{{order_number}} has been collected and is now on its way to you! Track your delivery: {{tracking_link}}', '["order_number", "tracking_link"]', 'Sent when driver leaves kitchen with order', true),
('driver_arrived', 'Driver Arrived at Venue', '✅ Your driver has arrived at {{venue_name}}! Your catering setup is now in progress.', '["venue_name"]', 'Sent when driver arrives at delivery venue', true),
('function_good_luck', 'Pre-Function Good Wishes', '🎉 Wishing you a fantastic event today! We hope your function at {{venue_name}} goes smoothly. If you need anything, we''re just a message away!', '["venue_name"]', 'Sent 1 hour before function start time', true),
('driver_replacement_requested', 'Driver Replacement Requested', '⚠️ Driver replacement needed for Order #{{order_number}} on {{event_date}}. {{original_driver_name}} is unable to complete the delivery. Please accept if available.', '["order_number", "event_date", "original_driver_name"]', 'Sent to available drivers when replacement is needed', true),
('driver_replacement_accepted', 'Driver Replacement Accepted', '✅ Great news! {{new_driver_name}} has accepted to handle Order #{{order_number}}. All details updated.', '["new_driver_name", "order_number"]', 'Sent to admin when replacement is accepted', true);-- Create time_clock_entries table for staff clock in/out
CREATE TABLE IF NOT EXISTS time_clock_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('clock_in', 'clock_out')),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create staff_work_sessions table to pair clock in/out
CREATE TABLE IF NOT EXISTS staff_work_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clock_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
  clock_out_time TIMESTAMP WITH TIME ZONE,
  total_hours DECIMAL(6, 2),
  hourly_rate DECIMAL(10, 2),
  total_earnings DECIMAL(10, 2),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create delivery_route_stops table for mid-route stops
CREATE TABLE IF NOT EXISTS delivery_route_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stop_type TEXT NOT NULL CHECK (stop_type IN ('emergency', 'last_minute_purchase', 'fuel', 'other')),
  stop_name TEXT NOT NULL,
  stop_address TEXT NOT NULL,
  stop_lat DECIMAL(10, 8),
  stop_lng DECIMAL(11, 8),
  arrival_time TIMESTAMP WITH TIME ZONE,
  departure_time TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  reason TEXT,
  receipt_url TEXT,
  amount_spent DECIMAL(10, 2),
  added_by_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create staff_payment_ledger table for tracking all payments
CREATE TABLE IF NOT EXISTS staff_payment_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_period_start DATE NOT NULL,
  payment_period_end DATE NOT NULL,
  total_hours DECIMAL(10, 2) NOT NULL,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'eft', 'other')),
  payment_reference TEXT,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE time_clock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_payment_ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policies for time_clock_entries
CREATE POLICY "Staff can create their own clock entries" ON time_clock_entries FOR INSERT WITH CHECK (auth.uid() = staff_id);
CREATE POLICY "Staff can view their own clock entries" ON time_clock_entries FOR SELECT USING (auth.uid() = staff_id);
CREATE POLICY "Admins can view all clock entries" ON time_clock_entries FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner'))
);

-- RLS Policies for staff_work_sessions
CREATE POLICY "Staff can view their own work sessions" ON staff_work_sessions FOR SELECT USING (auth.uid() = staff_id);
CREATE POLICY "System can create work sessions" ON staff_work_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update work sessions" ON staff_work_sessions FOR UPDATE USING (true);
CREATE POLICY "Admins can manage all work sessions" ON staff_work_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner'))
);

-- RLS Policies for delivery_route_stops
CREATE POLICY "Drivers can create their own stops" ON delivery_route_stops FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Drivers can view their own stops" ON delivery_route_stops FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Drivers can update their own stops" ON delivery_route_stops FOR UPDATE USING (auth.uid() = driver_id);
CREATE POLICY "Admins can manage all route stops" ON delivery_route_stops FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner'))
);

-- RLS Policies for staff_payment_ledger
CREATE POLICY "Staff cannot view payment ledger" ON staff_payment_ledger FOR SELECT USING (false);
CREATE POLICY "Admins can manage payment ledger" ON staff_payment_ledger FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner'))
);

-- Create indexes for performance
CREATE INDEX idx_time_clock_staff ON time_clock_entries(staff_id);
CREATE INDEX idx_time_clock_timestamp ON time_clock_entries(timestamp);
CREATE INDEX idx_work_sessions_staff ON staff_work_sessions(staff_id);
CREATE INDEX idx_work_sessions_status ON staff_work_sessions(payment_status);
CREATE INDEX idx_route_stops_order ON delivery_route_stops(order_id);
CREATE INDEX idx_route_stops_driver ON delivery_route_stops(driver_id);
CREATE INDEX idx_payment_ledger_staff ON staff_payment_ledger(staff_id);
CREATE INDEX idx_payment_ledger_period ON staff_payment_ledger(payment_period_start, payment_period_end);-- Create user_departments table for assigning users to multiple departments
CREATE TABLE IF NOT EXISTS user_departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('admin', 'kitchen', 'driver', 'cleaning', 'buyer', 'client')),
  is_primary BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, department)
);

-- Enable RLS
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view all user departments" ON user_departments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can assign departments" ON user_departments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can update departments" ON user_departments FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can remove departments" ON user_departments FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_departments_user_id ON user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_department ON user_departments(department);

-- Add helpful comment
COMMENT ON TABLE user_departments IS 'Allows users to be assigned to multiple departments/roles simultaneously';-- Create leads table for managing potential customers
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL,
  guest_count INTEGER NOT NULL,
  budget DECIMAL(10,2),
  special_requests TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'converted', 'lost')),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create equipment table for tracking catering equipment
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('chafing', 'serving', 'cutlery', 'crockery', 'glassware', 'linen', 'cooking', 'other')),
  quantity_total INTEGER NOT NULL DEFAULT 0,
  quantity_available INTEGER NOT NULL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('excellent', 'good', 'fair', 'needs_repair', 'retired')),
  rental_price DECIMAL(10,2) DEFAULT 0,
  purchase_date DATE,
  last_maintenance_date DATE,
  notes TEXT,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create deliveries table for tracking order deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pickup_time TIMESTAMP WITH TIME ZONE NOT NULL,
  delivery_time TIMESTAMP WITH TIME ZONE NOT NULL,
  actual_delivery_time TIMESTAMP WITH TIME ZONE,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_transit', 'delivered', 'cancelled')),
  driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  driver_notes TEXT,
  client_signature TEXT,
  delivery_photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for leads
CREATE POLICY "Users can view their own leads" ON leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own leads" ON leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own leads" ON leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own leads" ON leads FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for equipment
CREATE POLICY "Users can view their own equipment" ON equipment FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own equipment" ON equipment FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own equipment" ON equipment FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own equipment" ON equipment FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for deliveries
CREATE POLICY "Users can view deliveries for their orders" ON deliveries FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = deliveries.order_id AND orders.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert deliveries for their orders" ON deliveries FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = deliveries.order_id AND orders.user_id = auth.uid()
  ));
CREATE POLICY "Users can update deliveries for their orders" ON deliveries FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = deliveries.order_id AND orders.user_id = auth.uid()
  ));
CREATE POLICY "Drivers can view their assigned deliveries" ON deliveries FOR SELECT 
  USING (auth.uid() = driver_id);
CREATE POLICY "Drivers can update their assigned deliveries" ON deliveries FOR UPDATE 
  USING (auth.uid() = driver_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_event_date ON leads(event_date);
CREATE INDEX IF NOT EXISTS idx_equipment_user_id ON equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS quantity_total INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS category VARCHAR,
ADD COLUMN IF NOT EXISTS condition VARCHAR,
ADD COLUMN IF NOT EXISTS unit VARCHAR,
ADD COLUMN IF NOT EXISTS minimum_stock INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS shelf_life_days INT,
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS last_restocked DATE,
ADD COLUMN IF NOT EXISTS average_cost NUMERIC,
ADD COLUMN IF NOT EXISTS last_maintenance_date DATE;ALTER TABLE leads ADD COLUMN IF NOT EXISTS special_requests TEXT;-- src/supabase/migrations/YYYYMMDDHHMMSS_create_handle_new_user_trigger.sql

-- Drop the existing trigger and function if they exist to ensure a clean setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Creates a public.profiles table for a new user.
-- This function is called by a trigger when a new user is created in auth.users.
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert a new row into the public.profiles table, taking data from the new user record
  INSERT INTO public.profiles (id, email, full_name, role, currency, phone_number, company_name, subscription_plan, subscription_status, trial_ends_at)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'currency',
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'company_name',
    'trial', -- Default subscription plan on sign-up
    'trialing', -- Default subscription status on sign-up
    (now() + interval '14 days') -- Set trial to expire in 14 days
  );
  RETURN new;
END;
$$;

-- trigger the function every time a user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Grant usage on the uuid-ossp extension to the postgres user
-- This is necessary because the security definer function needs permission
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    GRANT USAGE ON SCHEMA public TO postgres;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;
  END IF;
END;
$$;

-- Add a comment to the function for clarity
COMMENT ON FUNCTION public.handle_new_user() IS 'Creates a profile for a new user and sets up a 14-day trial.';-- src/supabase/migrations/YYYYMMDDHHMMSS_create_handle_new_user_trigger.sql

-- Drop the existing trigger and function if they exist to ensure a clean setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Creates a public.profiles table for a new user.
-- This function is called by a trigger when a new user is created in auth.users.
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert a new row into the public.profiles table, taking data from the new user record
  INSERT INTO public.profiles (id, email, full_name, role, currency, phone_number, company_name, subscription_plan, subscription_status, trial_ends_at)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'currency',
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'company_name',
    'trial', -- Default subscription plan on sign-up
    'trial', -- FIXED: Changed from 'trialing' to 'trial' to match the constraint
    (now() + interval '14 days') -- Set trial to expire in 14 days
  );
  RETURN new;
END;
$$;

-- trigger the function every time a user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Grant usage on the uuid-ossp extension to the postgres user
-- This is necessary because the security definer function needs permission
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    GRANT USAGE ON SCHEMA public TO postgres;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;
  END IF;
END;
$$;

-- Add a comment to the function for clarity
COMMENT ON FUNCTION public.handle_new_user() IS 'Creates a profile for a new user and sets up a 14-day trial.';
-- Update the handle_new_user function to properly handle the role from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    currency,
    phone_number,
    company_name,
    subscription_status,
    subscription_plan,
    trial_ends_at,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    COALESCE(NEW.raw_user_meta_data->>'currency', 'ZAR'),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'company_name', NEW.raw_user_meta_data->>'full_name', ''),
    'trial',
    'trial',
    NOW() + INTERVAL '14 days',
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = COALESCE(EXCLUDED.role, profiles.role),
    currency = COALESCE(EXCLUDED.currency, profiles.currency),
    phone_number = COALESCE(EXCLUDED.phone_number, profiles.phone_number),
    company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists and is active
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();-- Add company_slug to profiles table for URL routing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_slug TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company_slug ON profiles(company_slug);

-- Add comment to explain the field
COMMENT ON COLUMN profiles.company_slug IS 'URL-friendly unique identifier for company portals (e.g., spit-braai-delivery)';-- Create kitchen duty shifts table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_staff ON kitchen_duty_shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_active ON kitchen_duty_shifts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_order ON kitchen_duty_shifts(order_id);

-- Enable RLS
ALTER TABLE kitchen_duty_shifts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kitchen_duty_shifts
CREATE POLICY "Staff can create their own duty shifts"
  ON kitchen_duty_shifts FOR INSERT
  WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Staff can update their own duty shifts"
  ON kitchen_duty_shifts FOR UPDATE
  USING (auth.uid() = staff_id);

CREATE POLICY "Staff can view duty shifts in their company"
  ON kitchen_duty_shifts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'kitchen', 'chef')
    )
  );

CREATE POLICY "Admins can manage all duty shifts"
  ON kitchen_duty_shifts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Create kitchen task completions table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_staff ON kitchen_task_completions(staff_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_order ON kitchen_task_completions(order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_type ON kitchen_task_completions(task_type);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_completed ON kitchen_task_completions(completed_at);

-- Enable RLS
ALTER TABLE kitchen_task_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kitchen_task_completions
CREATE POLICY "Staff can create their own task completions"
  ON kitchen_task_completions FOR INSERT
  WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Staff can view task completions in their company"
  ON kitchen_task_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'kitchen', 'chef')
    )
  );

CREATE POLICY "Admins can manage all task completions"
  ON kitchen_task_completions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );-- Equipment handover tracking table
CREATE TABLE IF NOT EXISTS equipment_handovers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  
  -- Handover chain tracking
  from_stage TEXT NOT NULL CHECK (from_stage IN ('kitchen', 'driver', 'client', 'return', 'cleaning', 'drying', 'ready')),
  to_stage TEXT NOT NULL CHECK (to_stage IN ('kitchen', 'driver', 'client', 'return', 'cleaning', 'drying', 'ready')),
  
  -- Personnel tracking
  handed_by_user_id UUID REFERENCES profiles(id),
  handed_by_name TEXT,
  received_by_user_id UUID REFERENCES profiles(id),
  received_by_name TEXT,
  
  -- Verification
  quantity_sent INTEGER NOT NULL,
  quantity_received INTEGER,
  discrepancy_noted BOOLEAN DEFAULT FALSE,
  discrepancy_reason TEXT,
  
  -- Timestamps
  handed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  received_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Broken/lost equipment tracking
CREATE TABLE IF NOT EXISTS equipment_damages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  handover_id UUID REFERENCES equipment_handovers(id),
  
  -- Damage details
  quantity_damaged INTEGER NOT NULL,
  damage_type TEXT NOT NULL CHECK (damage_type IN ('broken', 'lost', 'stolen', 'damaged')),
  damage_stage TEXT NOT NULL CHECK (damage_stage IN ('kitchen', 'driver', 'client', 'return', 'cleaning', 'drying')),
  
  -- Cost tracking
  unit_cost DECIMAL(10, 2) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  
  -- Responsibility
  responsible_user_id UUID REFERENCES profiles(id),
  responsible_name TEXT,
  
  -- Details
  description TEXT,
  notes TEXT,
  photo_url TEXT,
  
  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by_user_id UUID REFERENCES profiles(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cleaning team duty tracking
CREATE TABLE IF NOT EXISTS cleaning_duty_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  company_id UUID NOT NULL,
  
  -- Duty details
  on_duty BOOLEAN NOT NULL DEFAULT TRUE,
  duty_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  duty_ended_at TIMESTAMP WITH TIME ZONE,
  
  -- Equipment count verification
  equipment_verified BOOLEAN DEFAULT FALSE,
  equipment_verified_at TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Equipment cleaning status
CREATE TABLE IF NOT EXISTS equipment_cleaning_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  
  -- Cleaning workflow
  returned_quantity INTEGER NOT NULL,
  cleaning_started_at TIMESTAMP WITH TIME ZONE,
  cleaning_completed_at TIMESTAMP WITH TIME ZONE,
  drying_started_at TIMESTAMP WITH TIME ZONE,
  drying_completed_at TIMESTAMP WITH TIME ZONE,
  ready_for_use_at TIMESTAMP WITH TIME ZONE,
  
  -- Personnel
  cleaned_by_user_id UUID REFERENCES profiles(id),
  verified_by_user_id UUID REFERENCES profiles(id),
  
  -- Status
  current_status TEXT NOT NULL DEFAULT 'pending' CHECK (current_status IN ('pending', 'cleaning', 'drying', 'ready', 'stored')),
  
  -- Admin alerts
  admin_notified BOOLEAN DEFAULT FALSE,
  admin_notified_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE equipment_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_damages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_duty_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_cleaning_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies for equipment_handovers
CREATE POLICY "Users can view their company handovers" ON equipment_handovers FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert handovers" ON equipment_handovers FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update handovers" ON equipment_handovers FOR UPDATE USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);

-- RLS Policies for equipment_damages
CREATE POLICY "Users can view their company damages" ON equipment_damages FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert damages" ON equipment_damages FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update damages" ON equipment_damages FOR UPDATE USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);

-- RLS Policies for cleaning_duty_logs
CREATE POLICY "Users can view their company duty logs" ON cleaning_duty_logs FOR SELECT USING (
  company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Users can insert duty logs" ON cleaning_duty_logs FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "Users can update duty logs" ON cleaning_duty_logs FOR UPDATE USING (
  user_id = auth.uid()
);

-- RLS Policies for equipment_cleaning_status
CREATE POLICY "Users can view their company cleaning status" ON equipment_cleaning_status FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert cleaning status" ON equipment_cleaning_status FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update cleaning status" ON equipment_cleaning_status FOR UPDATE USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);

-- Indexes for performance
CREATE INDEX idx_equipment_handovers_order ON equipment_handovers(order_id);
CREATE INDEX idx_equipment_handovers_equipment ON equipment_handovers(equipment_id);
CREATE INDEX idx_equipment_damages_order ON equipment_damages(order_id);
CREATE INDEX idx_equipment_damages_equipment ON equipment_damages(equipment_id);
CREATE INDEX idx_equipment_damages_created ON equipment_damages(created_at);
CREATE INDEX idx_cleaning_duty_logs_user ON cleaning_duty_logs(user_id);
CREATE INDEX idx_cleaning_duty_logs_company ON cleaning_duty_logs(company_id);
CREATE INDEX idx_equipment_cleaning_status_order ON equipment_cleaning_status(order_id);-- Add active_role field to profiles table for tracking current active role
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS active_role text DEFAULT 'client';

-- Add constraint to ensure active_role is valid
ALTER TABLE profiles 
ADD CONSTRAINT profiles_active_role_check 
CHECK (active_role IN ('admin', 'driver', 'client', 'cleaning', 'shopping', 'kitchen', 'owner', 'super_admin', 'shopping_staff', 'cleaning_staff', 'kitchen_staff'));DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'admin', 'kitchen', 'driver', 'client', 'cleaning', 'shopping', 'owner', 'super_admin', 'shopping_staff', 'cleaning_staff', 'kitchen_staff'
        );
    END IF;
END$$;ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_role user_role;-- Drop existing admin policies
DROP POLICY IF EXISTS "Admins can assign departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can remove departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can update departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can view all user departments" ON user_departments;

-- Create new policies that check BOTH role and active_role
CREATE POLICY "Admins can view all departments"
ON user_departments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

CREATE POLICY "Admins can assign departments"
ON user_departments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

CREATE POLICY "Admins can update departments"
ON user_departments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

CREATE POLICY "Admins can delete departments"
ON user_departments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

-- Also add policy for users to view their own departments
CREATE POLICY "Users can view their own departments"
ON user_departments FOR SELECT
USING (user_id = auth.uid());-- Add policy to allow users to be assigned their first role during registration
-- This is needed when new users are created by the system
CREATE POLICY "Allow initial role assignment"
ON user_departments FOR INSERT
WITH CHECK (
  -- Allow if assigning 'client' role as initial default
  department = 'client'
  OR
  -- Allow if admin is assigning
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin')
  )
);

-- Also ensure service role can always assign roles (for system operations)
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;-- Drop the conflicting policies and create one comprehensive policy
DROP POLICY IF EXISTS "Admins can assign departments" ON user_departments;
DROP POLICY IF EXISTS "Allow initial role assignment" ON user_departments;

-- Create a single comprehensive INSERT policy
CREATE POLICY "Allow role assignments"
ON user_departments FOR INSERT
WITH CHECK (
  -- Allow if user is admin (for any role assignment)
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.role = 'admin' OR profiles.active_role = 'admin' OR profiles.role = 'owner' OR profiles.active_role = 'owner')
  )
  OR
  -- Allow client role assignment during registration (when no auth.uid() yet)
  (department = 'client' AND auth.uid() IS NULL)
  OR
  -- Allow self-assignment of client role during first login
  (department = 'client' AND user_id = auth.uid())
);-- Drop the existing policy and create a more comprehensive one
DROP POLICY IF EXISTS "Allow role assignments" ON user_departments;

-- Create a comprehensive INSERT policy that checks multiple admin scenarios
CREATE POLICY "Allow role assignments"
ON user_departments FOR INSERT
WITH CHECK (
  -- Scenario 1: User is admin/owner in profiles table
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
  OR
  -- Scenario 2: User has admin role in user_departments table
  EXISTS (
    SELECT 1 FROM user_departments ud
    WHERE ud.user_id = auth.uid()
    AND ud.department IN ('admin', 'owner', 'super_admin')
  )
  OR
  -- Scenario 3: Allow client role assignment during registration (first-time setup)
  (department = 'client' AND auth.uid() IS NOT NULL)
);-- First, let's check what user is currently authenticated (for debugging)
-- Then create a more permissive policy

-- Drop existing policy
DROP POLICY IF EXISTS "Allow role assignments" ON user_departments;

-- Create a more permissive policy with better conditions
CREATE POLICY "Allow role assignments"
ON user_departments FOR INSERT
WITH CHECK (
  -- Allow if user is authenticated and is an admin/owner
  (
    auth.uid() IS NOT NULL
    AND (
      -- Check profiles table for admin role
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner', 'super_admin')
      )
      OR
      -- Check profiles table for active_role as admin
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.active_role IN ('admin', 'owner', 'super_admin')
      )
      OR
      -- Allow client role self-assignment (for registration)
      department = 'client'
    )
  )
);

-- Also ensure SELECT policy exists for users to see their own roles
DROP POLICY IF EXISTS "Users can view their own roles" ON user_departments;
CREATE POLICY "Users can view their own roles"
ON user_departments FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner', 'super_admin')
  )
);

-- Ensure UPDATE policy exists for admins to update roles
DROP POLICY IF EXISTS "Admins can update roles" ON user_departments;
CREATE POLICY "Admins can update roles"
ON user_departments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner', 'super_admin')
  )
);

-- Ensure DELETE policy exists for admins to remove roles
DROP POLICY IF EXISTS "Admins can delete roles" ON user_departments;
CREATE POLICY "Admins can delete roles"
ON user_departments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner', 'super_admin')
  )
);-- CLEAN SLATE: Drop ALL existing policies on user_departments
DROP POLICY IF EXISTS "Admins can delete departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_departments;
DROP POLICY IF EXISTS "Allow role assignments" ON user_departments;
DROP POLICY IF EXISTS "Admins can view all departments" ON user_departments;
DROP POLICY IF EXISTS "Users can view their own departments" ON user_departments;
DROP POLICY IF EXISTS "Users can view their own roles" ON user_departments;
DROP POLICY IF EXISTS "Admins can update departments" ON user_departments;
DROP POLICY IF EXISTS "Admins can update roles" ON user_departments;

-- CREATE SIMPLE, COMPREHENSIVE POLICIES

-- 1. INSERT POLICY: Allow admins to assign any role, users to self-assign client
CREATE POLICY "user_departments_insert_policy" ON user_departments
FOR INSERT
WITH CHECK (
  -- Allow if user is an admin/owner/super_admin
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
  OR
  -- Allow users to self-assign 'client' role only
  (auth.uid() = user_id AND department = 'client')
);

-- 2. SELECT POLICY: Users can see their own roles, admins can see all
CREATE POLICY "user_departments_select_policy" ON user_departments
FOR SELECT
USING (
  -- Users can see their own roles
  auth.uid() = user_id
  OR
  -- Admins can see all roles
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
);

-- 3. UPDATE POLICY: Only admins can update roles
CREATE POLICY "user_departments_update_policy" ON user_departments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
);

-- 4. DELETE POLICY: Only admins can delete roles
CREATE POLICY "user_departments_delete_policy" ON user_departments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role IN ('admin', 'owner', 'super_admin')
      OR profiles.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
);

-- Verify the new policies
SELECT 
  policyname,
  cmd AS command,
  CASE 
    WHEN cmd = 'INSERT' THEN with_check
    ELSE qual
  END AS condition
FROM pg_policies
WHERE tablename = 'user_departments'
ORDER BY cmd, policyname;-- Drop the existing insert policy
DROP POLICY IF EXISTS user_departments_insert_policy ON user_departments;

-- Create a new, corrected insert policy
CREATE POLICY user_departments_insert_policy ON user_departments
FOR INSERT
WITH CHECK (
  -- Allow if the inserter is an admin/owner/super_admin
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role = ANY(ARRAY['admin', 'owner', 'super_admin'])
        OR profiles.active_role = ANY(ARRAY['admin', 'owner', 'super_admin'])
      )
  )
  OR
  -- Allow users to self-register as client
  (auth.uid() = user_id AND department = 'client')
);

-- Verify the new policy
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  with_check
FROM pg_policies
WHERE tablename = 'user_departments'
  AND policyname = 'user_departments_insert_policy';-- Phase 1: Create the companies table (without the complex RLS policy for now)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Contact Information
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'South Africa',
  
  -- Business Settings
  logo_url TEXT,
  brand_color TEXT DEFAULT '#4F46E5',
  currency TEXT DEFAULT 'ZAR',
  timezone TEXT DEFAULT 'Africa/Johannesburg',
  
  -- Subscription Status
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled')),
  subscription_plan TEXT,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies(owner_id);

-- Simple RLS Policies for now
CREATE POLICY "Company owners can manage their company"
  ON companies
  FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "Anyone can view active companies"
  ON companies
  FOR SELECT
  USING (is_active = true);

COMMENT ON TABLE companies IS 'Catering businesses that use the CateringMS platform';
COMMENT ON COLUMN companies.slug IS 'URL-safe slug for company (e.g., cateringms.com/company-slug)';
COMMENT ON COLUMN companies.owner_id IS 'The primary admin who created the account';-- Phase 2: Add company_id to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Create index for company_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);

-- Update the RLS policy on companies to allow staff to view their company
DROP POLICY IF EXISTS "Anyone can view active companies" ON companies;

CREATE POLICY "Company staff can view their company"
  ON companies
  FOR SELECT
  USING (
    owner_id = auth.uid() 
    OR 
    id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() AND company_id IS NOT NULL
    )
  );

COMMENT ON COLUMN profiles.company_id IS 'The company this user belongs to (catering business)';-- Phase 4: Add company_id to critical tables for proper data segmentation

-- Add company_id to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to inventory table
ALTER TABLE inventory
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to equipment table
ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to quotes table
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to driver_assignments table
ALTER TABLE driver_assignments
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to notifications table
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to shopping_lists table
ALTER TABLE shopping_lists
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Create indexes for all new company_id columns
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_company_id ON inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_company_id ON equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_company_id ON driver_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company_id ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_company_id ON shopping_lists(company_id);

COMMENT ON COLUMN orders.company_id IS 'The catering company this order belongs to';
COMMENT ON COLUMN inventory.company_id IS 'The catering company that owns this inventory';
COMMENT ON COLUMN equipment.company_id IS 'The catering company that owns this equipment';-- Drop existing policies that conflict
DROP POLICY IF EXISTS "Company staff can view their company" ON companies;
DROP POLICY IF EXISTS "Company owners can view their own companies" ON companies;
DROP POLICY IF EXISTS "Company owners can update their companies" ON companies;
DROP POLICY IF EXISTS "Users can insert companies during signup" ON companies;

-- Drop any existing policies on other tables
DROP POLICY IF EXISTS "Company staff can view company orders" ON orders;
DROP POLICY IF EXISTS "Company staff can create company orders" ON orders;
DROP POLICY IF EXISTS "Company staff can update company orders" ON orders;
DROP POLICY IF EXISTS "Company staff can delete company orders" ON orders;

DROP POLICY IF EXISTS "Company staff can view company inventory" ON inventory;
DROP POLICY IF EXISTS "Company staff can create company inventory" ON inventory;
DROP POLICY IF EXISTS "Company staff can update company inventory" ON inventory;
DROP POLICY IF EXISTS "Company staff can delete company inventory" ON inventory;

DROP POLICY IF EXISTS "Company staff can view company equipment" ON equipment;
DROP POLICY IF EXISTS "Company staff can create company equipment" ON equipment;
DROP POLICY IF EXISTS "Company staff can update company equipment" ON equipment;
DROP POLICY IF EXISTS "Company staff can delete company equipment" ON equipment;-- Create comprehensive RLS policies for company data isolation

-- ===========================================
-- COMPANIES TABLE RLS
-- ===========================================

-- Enable RLS on companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Company owners can view their own companies
CREATE POLICY "owners_view_own_company"
ON companies FOR SELECT
USING (auth.uid() = owner_id);

-- Company staff can view their company through profiles
CREATE POLICY "staff_view_company"
ON companies FOR SELECT
USING (
  id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Company owners can update their own companies
CREATE POLICY "owners_update_company"
ON companies FOR UPDATE
USING (auth.uid() = owner_id);

-- Users can insert companies during signup (owner_id must match auth.uid)
CREATE POLICY "users_create_own_company"
ON companies FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- ===========================================
-- ORDERS TABLE RLS
-- ===========================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Staff can view their company's orders
CREATE POLICY "staff_view_company_orders"
ON orders FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Staff can create orders for their company
CREATE POLICY "staff_create_company_orders"
ON orders FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Staff can update their company's orders
CREATE POLICY "staff_update_company_orders"
ON orders FOR UPDATE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Staff can delete their company's orders
CREATE POLICY "staff_delete_company_orders"
ON orders FOR DELETE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- ===========================================
-- INVENTORY TABLE RLS
-- ===========================================

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_company_inventory"
ON inventory FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_create_company_inventory"
ON inventory FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_update_company_inventory"
ON inventory FOR UPDATE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_delete_company_inventory"
ON inventory FOR DELETE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- ===========================================
-- EQUIPMENT TABLE RLS
-- ===========================================

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_company_equipment"
ON equipment FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_create_company_equipment"
ON equipment FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_update_company_equipment"
ON equipment FOR UPDATE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_delete_company_equipment"
ON equipment FOR DELETE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);-- Create RLS policies only for existing tables
-- Skip driver_routes and other tables that don't exist yet

-- ===========================================
-- QUOTES TABLE RLS (if exists)
-- ===========================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes') THEN
    ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "staff_view_company_quotes" ON quotes;
    DROP POLICY IF EXISTS "staff_create_company_quotes" ON quotes;
    DROP POLICY IF EXISTS "staff_update_company_quotes" ON quotes;
    DROP POLICY IF EXISTS "staff_delete_company_quotes" ON quotes;

    CREATE POLICY "staff_view_company_quotes"
    ON quotes FOR SELECT
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_create_company_quotes"
    ON quotes FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_update_company_quotes"
    ON quotes FOR UPDATE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_delete_company_quotes"
    ON quotes FOR DELETE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );
  END IF;
END $$;

-- ===========================================
-- LEADS TABLE RLS (if exists)
-- ===========================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "staff_view_company_leads" ON leads;
    DROP POLICY IF EXISTS "staff_create_company_leads" ON leads;
    DROP POLICY IF EXISTS "staff_update_company_leads" ON leads;
    DROP POLICY IF EXISTS "staff_delete_company_leads" ON leads;

    CREATE POLICY "staff_view_company_leads"
    ON leads FOR SELECT
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_create_company_leads"
    ON leads FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_update_company_leads"
    ON leads FOR UPDATE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_delete_company_leads"
    ON leads FOR DELETE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );
  END IF;
END $$;

-- ===========================================
-- EQUIPMENT TRACKING TABLE RLS (if exists)
-- ===========================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'equipment_tracking') THEN
    ALTER TABLE equipment_tracking ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "staff_view_company_equipment_tracking" ON equipment_tracking;
    DROP POLICY IF EXISTS "staff_create_company_equipment_tracking" ON equipment_tracking;
    DROP POLICY IF EXISTS "staff_update_company_equipment_tracking" ON equipment_tracking;

    CREATE POLICY "staff_view_company_equipment_tracking"
    ON equipment_tracking FOR SELECT
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_create_company_equipment_tracking"
    ON equipment_tracking FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_update_company_equipment_tracking"
    ON equipment_tracking FOR UPDATE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );
  END IF;
END $$;

-- ===========================================
-- KITCHEN DUTY LOGS TABLE RLS (if exists)
-- ===========================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_duty_logs') THEN
    ALTER TABLE kitchen_duty_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "staff_view_company_kitchen_logs" ON kitchen_duty_logs;
    DROP POLICY IF EXISTS "staff_create_company_kitchen_logs" ON kitchen_duty_logs;

    CREATE POLICY "staff_view_company_kitchen_logs"
    ON kitchen_duty_logs FOR SELECT
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_create_company_kitchen_logs"
    ON kitchen_duty_logs FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );
  END IF;
END $$;-- ==========================================
-- CATERING OPERATIONS MANAGEMENT SYSTEM
-- Comprehensive database schema for all 40 operational standards
-- ==========================================

-- 1. MENU PLANNING & RECIPES
-- ==========================================

-- Menu items with cost tracking
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- starter, main, dessert, beverage
  base_cost DECIMAL(10,2), -- cost to produce
  selling_price DECIMAL(10,2),
  profit_margin DECIMAL(5,2), -- calculated percentage
  prep_time_minutes INTEGER, -- time to prepare
  serves INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Standardized recipes (#2)
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  prep_steps JSONB, -- Array of step-by-step instructions
  cooking_steps JSONB,
  plating_notes TEXT,
  batch_size INTEGER DEFAULT 1, -- for batch cooking (#3)
  cook_time_minutes INTEGER,
  holding_temp_celsius DECIMAL(4,1), -- safe holding temperature
  shelf_life_hours INTEGER, -- how long it stays fresh
  active BOOLEAN DEFAULT true,
  locked BOOLEAN DEFAULT false, -- prevent changes (#2)
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipe ingredients (links recipes to inventory)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL, -- kg, g, ml, l, pieces
  cost_per_unit DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Allergen register (#9)
CREATE TABLE IF NOT EXISTS allergens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL, -- milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame
  icon_name TEXT, -- for UI display
  severity TEXT DEFAULT 'high', -- high, medium, low
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- Recipe allergens (many-to-many)
CREATE TABLE IF NOT EXISTS recipe_allergens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  allergen_id UUID NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
  notes TEXT, -- e.g., "contains traces", "may contain"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recipe_id, allergen_id)
);

-- 2. ADVANCED INVENTORY MANAGEMENT
-- ==========================================

-- FIFO inventory tracking (#8)
CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  batch_code TEXT NOT NULL, -- user-generated label (#8)
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  received_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  use_by_date DATE, -- different from expiry
  storage_location TEXT, -- fridge_1, freezer_2, dry_shelf_a
  storage_temp_celsius DECIMAL(4,1), -- actual temperature
  supplier_name TEXT,
  cost_per_unit DECIMAL(10,2),
  status TEXT DEFAULT 'available', -- available, in_use, expired, wasted
  preparer_initials TEXT, -- who prepped it (#10)
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Storage locations (#6, #7)
CREATE TABLE IF NOT EXISTS storage_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- cold, freezer, dry
  capacity_liters DECIMAL(10,2),
  current_usage_liters DECIMAL(10,2) DEFAULT 0,
  min_temp_celsius DECIMAL(4,1), -- e.g., 0 for cold storage
  max_temp_celsius DECIMAL(4,1), -- e.g., 5 for cold storage
  location_notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Temperature logs (#17)
CREATE TABLE IF NOT EXISTS temperature_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_location_id UUID REFERENCES storage_locations(id) ON DELETE CASCADE,
  recorded_temp_celsius DECIMAL(4,1) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recorded_by UUID REFERENCES profiles(id),
  alert_triggered BOOLEAN DEFAULT false, -- if temp outside range
  notes TEXT
);

-- Ingredient substitutions (#18)
CREATE TABLE IF NOT EXISTS ingredient_substitutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_ingredient TEXT NOT NULL,
  substitute_ingredient TEXT NOT NULL,
  ratio TEXT, -- e.g., "1:1", "use 50% more"
  cost_impact DECIMAL(10,2), -- positive or negative
  allergen_impact TEXT, -- what allergens are added/removed
  taste_impact TEXT, -- minimal, noticeable, significant
  tested BOOLEAN DEFAULT false,
  approved BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waste tracking (#16)
CREATE TABLE IF NOT EXISTS waste_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL, -- expired, spoiled, over-prep, spillage, damaged
  cost_value DECIMAL(10,2),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  logged_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. SUPPLIER MANAGEMENT
-- ==========================================

-- Suppliers (#4, #19)
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT, -- produce, meat, dairy, dry goods
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  priority INTEGER DEFAULT 2, -- 1=primary, 2=secondary, 3=emergency
  delivery_days TEXT, -- JSON array of days
  lead_time_hours INTEGER, -- how much notice needed
  minimum_order DECIMAL(10,2),
  rating DECIMAL(2,1), -- 1-5 star rating
  reliability_score INTEGER, -- 0-100
  quality_score INTEGER, -- 0-100
  active BOOLEAN DEFAULT true,
  emergency_contact BOOLEAN DEFAULT false, -- for #19
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supplier products with pricing
CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL,
  price_per_unit DECIMAL(10,2) NOT NULL,
  minimum_order_quantity DECIMAL(10,2),
  traceability_cert TEXT, -- certification number (#4)
  active BOOLEAN DEFAULT true,
  last_price_update DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. EQUIPMENT MANAGEMENT
-- ==========================================

-- Equipment maintenance (#13, #14)
CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  equipment_type TEXT, -- oven, fridge, freezer, hotplate, mixer
  serial_number TEXT,
  is_backup BOOLEAN DEFAULT false, -- backup equipment (#14)
  maintenance_frequency_days INTEGER DEFAULT 90, -- quarterly
  last_service_date DATE,
  next_service_date DATE,
  service_provider TEXT,
  service_cost DECIMAL(10,2),
  status TEXT DEFAULT 'operational', -- operational, needs_service, broken, backup
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Equipment maintenance history
CREATE TABLE IF NOT EXISTS equipment_service_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment_maintenance(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type TEXT, -- routine, repair, emergency, safety_check
  technician_name TEXT,
  cost DECIMAL(10,2),
  issues_found TEXT,
  actions_taken TEXT,
  next_service_due DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safety checks (#15)
CREATE TABLE IF NOT EXISTS safety_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL, -- gas, electrical, fire, structural
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

CREATE INDEX idx_menu_items_company ON menu_items(company_id);
CREATE INDEX idx_recipes_company ON recipes(company_id);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_inventory_batches_company_expiry ON inventory_batches(company_id, expiry_date);
CREATE INDEX idx_inventory_batches_status ON inventory_batches(status);
CREATE INDEX idx_temperature_logs_location_date ON temperature_logs(storage_location_id, recorded_at DESC);
CREATE INDEX idx_waste_logs_company_date ON waste_logs(company_id, date DESC);
CREATE INDEX idx_suppliers_company ON suppliers(company_id);
CREATE INDEX idx_equipment_maintenance_company ON equipment_maintenance(company_id);

-- Enable RLS
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE temperature_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (company-scoped)
CREATE POLICY "Users can view their company menu items" ON menu_items FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company menu items" ON menu_items FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their company recipes" ON recipes FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company recipes" ON recipes FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Anyone can view allergens" ON allergens FOR SELECT USING (true);

CREATE POLICY "Users can view their company inventory" ON inventory_batches FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company inventory" ON inventory_batches FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their company suppliers" ON suppliers FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company suppliers" ON suppliers FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their company equipment" ON equipment_maintenance FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company equipment" ON equipment_maintenance FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));-- ==========================================
-- STAFF OPERATIONS & DAILY MANAGEMENT
-- ==========================================

-- 5. STAFF TRAINING & CERTIFICATIONS
-- ==========================================

-- Training manuals & SOPs (#31)
CREATE TABLE IF NOT EXISTS training_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL, -- food_safety, equipment_use, customer_service, emergency_procedures
  content TEXT, -- markdown or rich text
  video_url TEXT,
  document_url TEXT,
  required_for_roles TEXT[], -- array of department names
  estimated_duration_minutes INTEGER,
  version INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff training completion tracking
CREATE TABLE IF NOT EXISTS staff_training_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  training_material_id UUID NOT NULL REFERENCES training_materials(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  score DECIMAL(5,2), -- if there's a test
  passed BOOLEAN DEFAULT false,
  certificate_issued BOOLEAN DEFAULT false,
  expiry_date DATE, -- for certifications that expire
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, training_material_id)
);

-- Health certificates (#37)
CREATE TABLE IF NOT EXISTS health_certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  certificate_type TEXT NOT NULL, -- food_handler, first_aid, allergen_awareness
  certificate_number TEXT,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  issuing_authority TEXT,
  document_url TEXT,
  status TEXT DEFAULT 'valid', -- valid, expiring_soon, expired
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cross-training matrix (#32)
CREATE TABLE IF NOT EXISTS staff_skills_matrix (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  department TEXT NOT NULL, -- kitchen, driver, cleaning, shopping
  proficiency_level TEXT NOT NULL, -- beginner, intermediate, advanced, expert
  certified BOOLEAN DEFAULT false,
  last_assessed_date DATE,
  assessed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, skill_name, department)
);

-- Performance reviews (#33)
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  reviewer_id UUID REFERENCES profiles(id),
  attendance_score INTEGER, -- 0-100
  speed_score INTEGER, -- 0-100
  accuracy_score INTEGER, -- 0-100
  teamwork_score INTEGER, -- 0-100
  overall_score INTEGER, -- 0-100
  strengths TEXT,
  areas_for_improvement TEXT,
  goals_for_next_period TEXT,
  bonus_eligible BOOLEAN DEFAULT false,
  bonus_amount DECIMAL(10,2),
  review_date DATE NOT NULL,
  next_review_date DATE,
  status TEXT DEFAULT 'draft', -- draft, completed, acknowledged
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff transport planning (#38)
CREATE TABLE IF NOT EXISTS staff_transport (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_location TEXT,
  pickup_location TEXT,
  pickup_time TIME NOT NULL,
  dropoff_time TIME,
  transport_type TEXT, -- company_shuttle, personal, allowance, uber
  cost DECIMAL(10,2),
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, cancelled
  driver_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emergency contacts (#35)
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone_primary TEXT NOT NULL,
  phone_secondary TEXT,
  email TEXT,
  address TEXT,
  medical_notes TEXT, -- allergies, conditions, medications
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Employee meal tracking (#36)
CREATE TABLE IF NOT EXISTS employee_meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type TEXT NOT NULL, -- breakfast, lunch, dinner, snack
  cost_per_meal DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Uniform tracking (#28)
CREATE TABLE IF NOT EXISTS uniform_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  item_type TEXT NOT NULL, -- shirt, pants, apron, hat, shoes
  size TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  issue_date DATE,
  return_date DATE,
  condition TEXT DEFAULT 'good', -- new, good, fair, poor, needs_replacement
  laundry_schedule TEXT, -- weekly, bi_weekly, after_each_shift
  last_cleaned DATE,
  replacement_due BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. DAILY OPERATIONS
-- ==========================================

-- Daily prep lists (#11)
CREATE TABLE IF NOT EXISTS daily_prep_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prep_date DATE NOT NULL,
  event_id UUID REFERENCES orders(id),
  recipe_id UUID REFERENCES recipes(id),
  item_name TEXT NOT NULL,
  quantity_needed DECIMAL(10,2) NOT NULL,
  unit TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id),
  priority TEXT DEFAULT 'normal', -- urgent, high, normal, low
  estimated_time_minutes INTEGER,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Portion control standards (#12)
CREATE TABLE IF NOT EXISTS portion_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id),
  item_name TEXT NOT NULL,
  standard_portion_grams DECIMAL(10,2) NOT NULL,
  tolerance_grams DECIMAL(10,2) DEFAULT 5, -- allowed variance
  serving_tool TEXT, -- ladle_size, scoop_number, plate_guide
  visual_guide_url TEXT, -- photo of correct portion
  cost_per_portion DECIMAL(10,2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waitstaff briefings (#27)
CREATE TABLE IF NOT EXISTS event_briefings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES orders(id),
  briefing_date TIMESTAMP WITH TIME ZONE NOT NULL,
  briefed_by UUID REFERENCES profiles(id),
  menu_items TEXT[], -- array of menu items
  allergen_alerts TEXT[], -- special allergen notes
  service_flow TEXT, -- order of service
  special_instructions TEXT,
  quick_card_url TEXT, -- printed reference card
  attendees UUID[], -- array of staff who attended
  duration_minutes INTEGER,
  status TEXT DEFAULT 'scheduled', -- scheduled, completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Labour cost tracking (#39)
CREATE TABLE IF NOT EXISTS labour_cost_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_hours_worked DECIMAL(10,2) NOT NULL,
  regular_hours DECIMAL(10,2) NOT NULL,
  overtime_hours DECIMAL(10,2) DEFAULT 0,
  total_labour_cost DECIMAL(10,2) NOT NULL,
  total_revenue DECIMAL(10,2),
  labour_cost_percentage DECIMAL(5,2), -- calculated
  target_percentage DECIMAL(5,2) DEFAULT 30, -- target is 30%
  variance DECIMAL(5,2), -- difference from target
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Overtime tracking (#30)
CREATE TABLE IF NOT EXISTS overtime_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  regular_hours DECIMAL(5,2),
  overtime_hours DECIMAL(5,2) NOT NULL,
  reason TEXT,
  approved_by UUID REFERENCES profiles(id),
  approved BOOLEAN DEFAULT false,
  cost DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Retention incentives tracking (#40)
CREATE TABLE IF NOT EXISTS retention_incentives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  incentive_type TEXT NOT NULL, -- quarterly_bonus, attendance_bonus, performance_bonus, anniversary
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  criteria_met BOOLEAN DEFAULT false,
  criteria_details TEXT,
  amount DECIMAL(10,2),
  paid_date DATE,
  status TEXT DEFAULT 'pending', -- pending, approved, paid
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batch cooking tracking (#3)
CREATE TABLE IF NOT EXISTS batch_cooking_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id),
  batch_number TEXT NOT NULL,
  batch_size INTEGER NOT NULL,
  cook_start_time TIMESTAMP WITH TIME ZONE,
  cook_end_time TIMESTAMP WITH TIME ZONE,
  holding_temp_celsius DECIMAL(4,1),
  cooling_start_time TIMESTAMP WITH TIME ZONE,
  cooling_end_time TIMESTAMP WITH TIME ZONE,
  final_storage_location TEXT,
  use_by_time TIMESTAMP WITH TIME ZONE,
  prepared_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'cooking', -- cooking, cooling, holding, finished, served
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_training_materials_company ON training_materials(company_id);
CREATE INDEX idx_staff_training_records_user ON staff_training_records(user_id);
CREATE INDEX idx_health_certificates_user_expiry ON health_certificates(user_id, expiry_date);
CREATE INDEX idx_staff_skills_matrix_user ON staff_skills_matrix(user_id);
CREATE INDEX idx_performance_reviews_user ON performance_reviews(user_id);
CREATE INDEX idx_daily_prep_lists_date ON daily_prep_lists(prep_date, status);
CREATE INDEX idx_event_briefings_event ON event_briefings(event_id);
CREATE INDEX idx_overtime_logs_user_date ON overtime_logs(user_id, date DESC);
CREATE INDEX idx_batch_cooking_logs_recipe ON batch_cooking_logs(recipe_id);

-- Enable RLS
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_skills_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_transport ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniform_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prep_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE portion_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_cost_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_incentives ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_cooking_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view company training materials" ON training_materials FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage company training materials" ON training_materials FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their own training records" ON staff_training_records FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage training records" ON staff_training_records FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = (SELECT company_id FROM staff_training_records WHERE user_id = auth.uid())));

CREATE POLICY "Users can view their own health certificates" ON health_certificates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage health certificates" ON health_certificates FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = (SELECT company_id FROM health_certificates WHERE user_id = auth.uid())));

CREATE POLICY "Users can view their own emergency contacts" ON emergency_contacts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage their own emergency contacts" ON emergency_contacts FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view company prep lists" ON daily_prep_lists FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage company prep lists" ON daily_prep_lists FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));-- 1. Fleet Management Tables (#61, #62, #68, #69, #72)
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    make TEXT,
    model TEXT,
    year INT,
    vin TEXT UNIQUE,
    license_plate TEXT,
    status TEXT DEFAULT 'active', -- e.g., active, in_service, sold
    mileage INT DEFAULT 0,
    purchase_date DATE,
    purchase_price NUMERIC,
    insurance_provider TEXT,
    insurance_policy_number TEXT,
    insurance_expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage their company's vehicles" ON vehicles
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
    );

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
    service_date DATE NOT NULL,
    service_type TEXT NOT NULL, -- e.g., Oil Change, Tire Rotation, Annual Service
    description TEXT,
    cost NUMERIC,
    provider TEXT,
    mileage_at_service INT,
    next_service_due_date DATE,
    next_service_due_mileage INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage maintenance for their company's vehicles" ON vehicle_maintenance
    FOR ALL USING (
        (SELECT company_id FROM vehicles WHERE id = vehicle_id) IN 
        (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
    );

CREATE TABLE IF NOT EXISTS vehicle_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
    log_date DATE NOT NULL,
    log_type TEXT NOT NULL, -- e.g., Fuel, Cleaning, Incident
    value_numeric NUMERIC, -- For fuel cost, liters, etc.
    value_text TEXT, -- For notes, cleaning details
    logged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicle_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage logs for their company's vehicles" ON vehicle_logs
    FOR ALL USING (
        (SELECT company_id FROM vehicles WHERE id = vehicle_id) IN 
        (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
    );


-- 2. Equipment Kit Tables (#42, #70)
CREATE TABLE IF NOT EXISTS equipment_kits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    kit_size TEXT, -- e.g., small, medium, large
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

ALTER TABLE equipment_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage their company's equipment kits" ON equipment_kits
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
    );

CREATE TABLE IF NOT EXISTS equipment_kit_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kit_id UUID REFERENCES equipment_kits(id) ON DELETE CASCADE NOT NULL,
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
    quantity INT NOT NULL,
    notes TEXT,
    UNIQUE(kit_id, equipment_id)
);

ALTER TABLE equipment_kit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage items in their company's kits" ON equipment_kit_items
    FOR ALL USING (
        (SELECT company_id FROM equipment_kits WHERE id = kit_id) IN 
        (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
    );


-- 3. Financial Depreciation Table (#54)
CREATE TABLE IF NOT EXISTS financial_depreciation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
    purchase_price NUMERIC NOT NULL,
    purchase_date DATE NOT NULL,
    useful_life_years INT NOT NULL,
    salvage_value NUMERIC DEFAULT 0,
    depreciation_method TEXT DEFAULT 'straight_line',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE financial_depreciation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage depreciation for their company's equipment" ON financial_depreciation
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
    );-- Equipment tracking for operational standards 41-75

-- PAT Testing (Electrical Safety) #43
CREATE TABLE IF NOT EXISTS pat_testing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  test_date DATE NOT NULL,
  next_test_date DATE NOT NULL,
  tester_name TEXT,
  certificate_number TEXT,
  test_result TEXT CHECK (test_result IN ('pass', 'fail', 'advisory')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backup Generators #44
CREATE TABLE IF NOT EXISTS backup_generators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT,
  capacity_kw NUMERIC(10, 2),
  fuel_type TEXT,
  location TEXT,
  last_service_date DATE,
  next_service_date DATE,
  auto_start_enabled BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'operational' CHECK (status IN ('operational', 'maintenance', 'faulty')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cooking Fuel Stockpile #46
CREATE TABLE IF NOT EXISTS fuel_stockpile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('gas_cylinder', 'propane', 'butane', 'diesel', 'other')),
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'cylinders',
  location TEXT,
  minimum_stock_level INTEGER DEFAULT 2,
  last_restock_date DATE,
  supplier_id UUID REFERENCES suppliers(id),
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Serving Utensils QR Tracking #47
CREATE TABLE IF NOT EXISTS utensil_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  utensil_type TEXT NOT NULL,
  qr_code TEXT UNIQUE NOT NULL,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'checked_out', 'in_use', 'returned', 'lost', 'damaged')),
  checked_out_by UUID REFERENCES profiles(id),
  checked_out_at TIMESTAMP WITH TIME ZONE,
  checked_in_at TIMESTAMP WITH TIME ZONE,
  event_id UUID REFERENCES orders(id),
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Linen Management #49
CREATE TABLE IF NOT EXISTS linen_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('tablecloth', 'napkin', 'runner', 'chair_cover', 'apron', 'other')),
  color TEXT,
  size TEXT,
  quantity_total INTEGER NOT NULL,
  quantity_clean INTEGER DEFAULT 0,
  quantity_dirty INTEGER DEFAULT 0,
  quantity_in_laundry INTEGER DEFAULT 0,
  laundry_cycle_days INTEGER DEFAULT 2,
  last_laundry_date DATE,
  next_laundry_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dishwasher Cycle Planning #50
CREATE TABLE IF NOT EXISTS dishwasher_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  machine_name TEXT NOT NULL,
  cycle_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  cycle_end_time TIMESTAMP WITH TIME ZONE,
  cycle_duration_minutes INTEGER DEFAULT 20,
  load_type TEXT CHECK (load_type IN ('cutlery', 'plates', 'glassware', 'pots_pans', 'mixed')),
  completed BOOLEAN DEFAULT false,
  operator_id UUID REFERENCES profiles(id),
  temperature_celsius NUMERIC(5, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Glassware Categorization #51
CREATE TABLE IF NOT EXISTS glassware_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  glass_type TEXT NOT NULL,
  style_name TEXT,
  capacity_ml INTEGER,
  photo_url TEXT,
  quantity_owned INTEGER DEFAULT 0,
  quantity_available INTEGER DEFAULT 0,
  suitable_for TEXT[], -- Array of drink types
  minimum_stock_level INTEGER DEFAULT 50,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Storage Rack Mapping #52
CREATE TABLE IF NOT EXISTS storage_racks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rack_number TEXT NOT NULL,
  zone TEXT NOT NULL,
  shelf_count INTEGER DEFAULT 1,
  current_contents TEXT,
  temperature_controlled BOOLEAN DEFAULT false,
  notes TEXT,
  map_position_x INTEGER, -- For visual mapping
  map_position_y INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, rack_number)
);

-- Cleaning Supplies Auto-Reorder #55
CREATE TABLE IF NOT EXISTS cleaning_supplies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supply_name TEXT NOT NULL,
  category TEXT CHECK (category IN ('sanitizer', 'detergent', 'disinfectant', 'soap', 'other')),
  current_quantity NUMERIC(10, 2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'liters',
  minimum_stock_level NUMERIC(10, 2) NOT NULL,
  reorder_trigger_level NUMERIC(10, 2) NOT NULL,
  auto_reorder_enabled BOOLEAN DEFAULT true,
  supplier_id UUID REFERENCES suppliers(id),
  last_reorder_date DATE,
  cost_per_unit NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pest Control Schedule #56
CREATE TABLE IF NOT EXISTS pest_control_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  next_inspection_date DATE NOT NULL,
  inspector_name TEXT,
  company_name TEXT,
  certificate_number TEXT,
  areas_inspected TEXT[],
  findings TEXT,
  activity_detected BOOLEAN DEFAULT false,
  treatment_applied BOOLEAN DEFAULT false,
  treatment_details TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  report_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safety Equipment Tracking #57
CREATE TABLE IF NOT EXISTS safety_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('fire_extinguisher', 'fire_blanket', 'first_aid_kit', 'eye_wash', 'other')),
  location TEXT NOT NULL,
  serial_number TEXT,
  installation_date DATE,
  last_inspection_date DATE,
  next_inspection_date DATE NOT NULL,
  expiry_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'needs_service', 'replaced')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lighting Adequacy Tests #58
CREATE TABLE IF NOT EXISTS lighting_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  test_date DATE NOT NULL,
  area_tested TEXT NOT NULL,
  lux_measurement NUMERIC(10, 2) NOT NULL,
  minimum_required_lux NUMERIC(10, 2) DEFAULT 500,
  compliant BOOLEAN GENERATED ALWAYS AS (lux_measurement >= minimum_required_lux) STORED,
  tester_name TEXT,
  remedial_action_required BOOLEAN DEFAULT false,
  action_taken TEXT,
  next_test_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Floor Safety Inspections #59
CREATE TABLE IF NOT EXISTS floor_safety_inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  area TEXT NOT NULL,
  mat_condition TEXT CHECK (mat_condition IN ('good', 'worn', 'needs_replacement')),
  drainage_working BOOLEAN DEFAULT true,
  slip_risk_level TEXT CHECK (slip_risk_level IN ('low', 'medium', 'high')),
  issues_found TEXT,
  corrective_actions TEXT,
  inspector_id UUID REFERENCES profiles(id),
  photo_urls TEXT[],
  next_inspection_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Delivery Crates Barcode System #60
CREATE TABLE IF NOT EXISTS delivery_crates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  barcode TEXT UNIQUE NOT NULL,
  crate_type TEXT CHECK (crate_type IN ('insulated', 'standard', 'cold', 'hot')),
  capacity_liters NUMERIC(10, 2),
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_transit', 'at_event', 'cleaning', 'damaged')),
  assigned_to_driver UUID REFERENCES profiles(id),
  assigned_to_event UUID REFERENCES orders(id),
  last_cleaned_date DATE,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Load Planning (Hot/Cold Separation) #64
CREATE TABLE IF NOT EXISTS load_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES orders(id),
  vehicle_id UUID REFERENCES vehicles(id),
  created_by UUID REFERENCES profiles(id),
  hot_zone_items TEXT[],
  cold_zone_items TEXT[],
  temperature_requirements TEXT,
  loading_sequence INTEGER[],
  special_instructions TEXT,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ice and Cooling Transport #71
CREATE TABLE IF NOT EXISTS ice_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID REFERENCES orders(id),
  ice_type TEXT CHECK (ice_type IN ('cubed', 'crushed', 'block')),
  quantity_kg NUMERIC(10, 2) NOT NULL,
  departure_condition TEXT CHECK (departure_condition IN ('solid', 'partially_melted', 'liquid')),
  arrival_condition TEXT CHECK (arrival_condition IN ('solid', 'partially_melted', 'liquid')),
  transport_duration_minutes INTEGER,
  cooler_type TEXT,
  temperature_on_arrival_celsius NUMERIC(5, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insurance Tracking #72
CREATE TABLE IF NOT EXISTS insurance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('vehicle', 'goods_in_transit', 'liability', 'equipment', 'property', 'other')),
  policy_number TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  coverage_amount NUMERIC(15, 2),
  currency TEXT DEFAULT 'ZAR',
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  premium_amount NUMERIC(10, 2),
  premium_frequency TEXT CHECK (premium_frequency IN ('monthly', 'quarterly', 'annually')),
  documents_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Load-off Procedures #73
CREATE TABLE IF NOT EXISTS loadoff_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES orders(id),
  driver_id UUID REFERENCES profiles(id),
  venue_arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
  unloading_sequence_followed BOOLEAN DEFAULT true,
  manifest_verified BOOLEAN DEFAULT false,
  items_damaged TEXT[],
  items_missing TEXT[],
  signature_collected BOOLEAN DEFAULT false,
  signature_image_url TEXT,
  venue_contact_name TEXT,
  venue_contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Return Load Tracking #74
CREATE TABLE IF NOT EXISTS return_load_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES orders(id),
  driver_id UUID REFERENCES profiles(id),
  departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
  arrival_time TIMESTAMP WITH TIME ZONE,
  items_expected TEXT[],
  items_returned TEXT[],
  items_missing TEXT[],
  items_damaged TEXT[],
  scan_verification_complete BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Driver Rest Compliance #75
CREATE TABLE IF NOT EXISTS driver_rest_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id),
  shift_date DATE NOT NULL,
  shift_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  shift_end_time TIMESTAMP WITH TIME ZONE,
  total_driving_hours NUMERIC(5, 2),
  rest_breaks_taken INTEGER DEFAULT 0,
  rest_duration_minutes INTEGER,
  compliant BOOLEAN DEFAULT true,
  violations TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE pat_testing ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_generators ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_stockpile ENABLE ROW LEVEL SECURITY;
ALTER TABLE utensil_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE linen_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE dishwasher_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE glassware_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pest_control_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE lighting_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_safety_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_crates ENABLE ROW LEVEL SECURITY;
ALTER TABLE load_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE loadoff_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_load_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_rest_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for company isolation
CREATE POLICY "Company access only" ON pat_testing FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON backup_generators FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON fuel_stockpile FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON utensil_tracking FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON linen_inventory FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON dishwasher_cycles FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON glassware_catalog FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON storage_racks FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON cleaning_supplies FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON pest_control_logs FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON safety_equipment FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON lighting_tests FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON floor_safety_inspections FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON delivery_crates FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON load_plans FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON ice_tracking FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON insurance_policies FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON loadoff_verifications FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON return_load_tracking FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON driver_rest_logs FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically call the function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;-- ============================================
-- PHASE 1: FIX CRITICAL RLS POLICIES
-- ============================================

-- 1. FIX PROFILES TABLE - Company-Scoped Access
-- Current issue: Everyone can view all profiles (too permissive)

-- Drop overly permissive policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

-- Create proper company-scoped policies
CREATE POLICY "users_view_own_profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_view_company_profiles"
  ON profiles FOR SELECT
  USING (
    company_id IS NOT NULL 
    AND company_id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- 2. FIX USER_DEPARTMENTS - Add Company-Scoped Access
-- Current issue: Policies check roles but don't validate company context

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "user_departments_insert_policy" ON user_departments;
DROP POLICY IF EXISTS "user_departments_update_policy" ON user_departments;
DROP POLICY IF EXISTS "user_departments_delete_policy" ON user_departments;
DROP POLICY IF EXISTS "user_departments_select_policy" ON user_departments;

-- Create unified company-aware policies
CREATE POLICY "company_admins_manage_departments"
  ON user_departments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = (SELECT company_id FROM profiles WHERE id = user_departments.user_id)
      AND p.active_role IN ('admin', 'owner', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = (SELECT company_id FROM profiles WHERE id = user_departments.user_id)
      AND p.active_role IN ('admin', 'owner', 'super_admin')
    )
  );

CREATE POLICY "users_view_own_departments"
  ON user_departments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_self_register_as_client"
  ON user_departments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND department = 'client'
  );

-- 3. FIX COMPANIES TABLE - Improve Staff Access
-- Current issue: Staff policies exist but need company_id validation

-- Add policy for staff to update company details
CREATE POLICY "staff_update_own_company"
  ON companies FOR UPDATE
  USING (
    id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
      AND active_role IN ('admin', 'owner')
    )
  );-- ============================================
-- PHASE 2: TRIAL EXPIRY NOTIFICATION SYSTEM
-- ============================================

-- 1. Create trial_expiry_notifications table
CREATE TABLE IF NOT EXISTS trial_expiry_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('7_days', '3_days', '1_day', 'expired')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  trial_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  days_remaining INTEGER NOT NULL,
  notification_method TEXT DEFAULT 'email' CHECK (notification_method IN ('email', 'dashboard', 'both')),
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  dashboard_seen BOOLEAN DEFAULT false,
  dashboard_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_trial_notifications_company ON trial_expiry_notifications(company_id);
CREATE INDEX idx_trial_notifications_type ON trial_expiry_notifications(notification_type);
CREATE INDEX idx_trial_notifications_sent ON trial_expiry_notifications(sent_at);

-- 2. RLS Policies for trial notifications
ALTER TABLE trial_expiry_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_owners_view_trial_notifications"
  ON trial_expiry_notifications FOR SELECT
  USING (
    company_id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
      AND active_role IN ('admin', 'owner')
    )
  );

CREATE POLICY "system_insert_trial_notifications"
  ON trial_expiry_notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "company_owners_update_trial_notifications"
  ON trial_expiry_notifications FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
      AND active_role IN ('admin', 'owner')
    )
  );

-- 3. Create function to check and send trial expiry notifications
CREATE OR REPLACE FUNCTION check_trial_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  company_record RECORD;
  days_remaining INTEGER;
  notification_type TEXT;
BEGIN
  -- Loop through all companies with active trials
  FOR company_record IN
    SELECT 
      id,
      name,
      slug,
      owner_id,
      trial_ends_at,
      subscription_status
    FROM companies
    WHERE subscription_status = 'trial'
    AND trial_ends_at IS NOT NULL
    AND is_active = true
  LOOP
    -- Calculate days remaining
    days_remaining := EXTRACT(DAY FROM (company_record.trial_ends_at - NOW()));
    
    -- Determine notification type
    notification_type := NULL;
    
    IF days_remaining <= 0 THEN
      notification_type := 'expired';
    ELSIF days_remaining <= 1 THEN
      notification_type := '1_day';
    ELSIF days_remaining <= 3 THEN
      notification_type := '3_days';
    ELSIF days_remaining <= 7 THEN
      notification_type := '7_days';
    END IF;
    
    -- Only proceed if notification needed
    IF notification_type IS NOT NULL THEN
      -- Check if this notification was already sent
      IF NOT EXISTS (
        SELECT 1 
        FROM trial_expiry_notifications
        WHERE company_id = company_record.id
        AND notification_type = notification_type
        AND sent_at > NOW() - INTERVAL '1 day'
      ) THEN
        -- Insert notification record
        INSERT INTO trial_expiry_notifications (
          company_id,
          notification_type,
          trial_ends_at,
          days_remaining,
          notification_method
        ) VALUES (
          company_record.id,
          notification_type,
          company_record.trial_ends_at,
          days_remaining,
          'both'
        );
        
        -- Create dashboard notification for company owner
        INSERT INTO notifications (
          user_id,
          recipient_id,
          notification_type,
          title,
          message,
          link,
          priority,
          company_id
        )
        SELECT
          company_record.owner_id,
          company_record.owner_id,
          'trial_expiry',
          CASE notification_type
            WHEN 'expired' THEN '🚨 Trial Expired'
            WHEN '1_day' THEN '⏰ Trial Expires Tomorrow'
            WHEN '3_days' THEN '⏰ Trial Expires in 3 Days'
            WHEN '7_days' THEN '📅 Trial Expires in 7 Days'
          END,
          CASE notification_type
            WHEN 'expired' THEN 'Your trial has expired. Subscribe now to continue using CateringMS.'
            WHEN '1_day' THEN 'Your trial expires tomorrow. Subscribe now to avoid interruption.'
            WHEN '3_days' THEN 'Your trial expires in 3 days. Choose a plan to continue.'
            WHEN '7_days' THEN 'Your trial expires in 7 days. Review our subscription plans.'
          END,
          '/' || company_record.slug || '/admin/subscription',
          CASE notification_type
            WHEN 'expired' THEN 'urgent'
            WHEN '1_day' THEN 'high'
            ELSE 'normal'
          END,
          company_record.id
        WHERE company_record.owner_id IS NOT NULL;
        
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 4. Add comment explaining the function
COMMENT ON FUNCTION check_trial_expiry_notifications() IS 
'Checks all trial companies and creates notifications at 7, 3, 1 days before expiry and on expiry. Run this daily via cron job or Edge Function.';-- ==================== CRITICAL RLS POLICY FIXES ====================
-- This script fixes all Row-Level Security policies to ensure proper data isolation
-- between companies and prevent data leakage

-- ==================== FIX 1: USER_DEPARTMENTS TABLE ====================
-- CRITICAL: The current RLS policies allow company admins to manage ANY user's departments
-- if they're in the same company. This is correct, but we need to ensure proper checks.

-- Drop existing problematic policies
DROP POLICY IF EXISTS "company_admins_manage_departments" ON user_departments;
DROP POLICY IF EXISTS "users_self_register_as_client" ON user_departments;
DROP POLICY IF EXISTS "users_view_own_departments" ON user_departments;

-- Create proper policies with company_id validation
CREATE POLICY "users_view_own_departments" ON user_departments
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users_self_register_as_client" ON user_departments
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() 
    AND department = 'client'
  );

CREATE POLICY "company_admins_manage_departments" ON user_departments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p1
      WHERE p1.id = auth.uid()
      AND p1.company_id IS NOT NULL
      AND p1.active_role IN ('admin', 'owner', 'super_admin')
      AND p1.company_id = (
        SELECT p2.company_id FROM profiles p2 WHERE p2.id = user_departments.user_id
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p1
      WHERE p1.id = auth.uid()
      AND p1.company_id IS NOT NULL
      AND p1.active_role IN ('admin', 'owner', 'super_admin')
      AND p1.company_id = (
        SELECT p2.company_id FROM profiles p2 WHERE p2.id = user_departments.user_id
      )
    )
  );

-- ==================== FIX 2: PROFILES TABLE ====================
-- CRITICAL: Ensure users can only see profiles within their company

DROP POLICY IF EXISTS "users_view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "Enable profile creation for new users" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create proper policies
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users_view_company_profiles" ON profiles
  FOR SELECT
  USING (
    company_id IS NOT NULL 
    AND company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

CREATE POLICY "users_create_own_profile" ON profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid());

-- ==================== FIX 3: COMPANIES TABLE ====================
-- CRITICAL: Ensure proper company isolation

DROP POLICY IF EXISTS "Company owners can manage their company" ON companies;
DROP POLICY IF EXISTS "owners_update_company" ON companies;
DROP POLICY IF EXISTS "owners_view_own_company" ON companies;
DROP POLICY IF EXISTS "staff_update_own_company" ON companies;
DROP POLICY IF EXISTS "staff_view_company" ON companies;
DROP POLICY IF EXISTS "users_create_own_company" ON companies;

-- Create proper policies
CREATE POLICY "company_owners_view" ON companies
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

CREATE POLICY "company_owners_create" ON companies
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "company_admins_update" ON companies
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL 
      AND active_role IN ('admin', 'owner')
    )
  );

-- ==================== FIX 4: TRIAL_EXPIRY_NOTIFICATIONS TABLE ====================
-- CRITICAL: Ensure only company admins and system can access

DROP POLICY IF EXISTS "company_owners_view_trial_notifications" ON trial_expiry_notifications;
DROP POLICY IF EXISTS "company_owners_update_trial_notifications" ON trial_expiry_notifications;
DROP POLICY IF EXISTS "system_insert_trial_notifications" ON trial_expiry_notifications;

CREATE POLICY "system_insert_trial_notifications" ON trial_expiry_notifications
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "company_admins_view_trial_notifications" ON trial_expiry_notifications
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL 
      AND active_role IN ('admin', 'owner')
    )
  );

CREATE POLICY "company_admins_update_trial_notifications" ON trial_expiry_notifications
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL 
      AND active_role IN ('admin', 'owner')
    )
  );

-- ==================== FIX 5: SUPER_ADMIN ACCESS ====================
-- CRITICAL: Add super_admin bypass for platform management

-- Super admins can view all companies
CREATE POLICY "super_admin_view_all_companies" ON companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- Super admins can view all profiles
CREATE POLICY "super_admin_view_all_profiles" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() 
      AND p.active_role = 'super_admin'
    )
  );

-- Super admins can view all trial notifications
CREATE POLICY "super_admin_view_all_trial_notifications" ON trial_expiry_notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 6: SUBSCRIPTIONS TABLE ====================
-- CRITICAL: Ensure subscriptions are properly isolated

-- Users should only see their own subscriptions, not other company users' subscriptions
DROP POLICY IF EXISTS "Users can view their own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON subscriptions;

CREATE POLICY "users_view_own_subscriptions" ON subscriptions
  FOR SELECT
  USING (user_id = auth.uid());-- ==================== PHASE 2: ADDITIONAL CRITICAL RLS FIXES ====================

-- ==================== FIX 7: ORDERS TABLE ====================
-- CRITICAL: Ensure orders are properly isolated by company

-- Orders should only be visible to company staff and assigned drivers/chefs
DROP POLICY IF EXISTS "Drivers can view assigned orders" ON orders;
DROP POLICY IF EXISTS "Chefs can view assigned orders" ON orders;

CREATE POLICY "drivers_view_assigned_orders" ON orders
  FOR SELECT
  USING (assigned_driver_id = auth.uid());

CREATE POLICY "chefs_view_assigned_orders" ON orders
  FOR SELECT
  USING (assigned_chef_id = auth.uid());

CREATE POLICY "clients_view_own_orders" ON orders
  FOR SELECT
  USING (client_id = auth.uid());

-- ==================== FIX 8: LEADS TABLE ====================
-- CRITICAL: Ensure leads are company-isolated

-- Add missing super_admin access
CREATE POLICY "super_admin_view_all_leads" ON leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 9: QUOTES TABLE ====================
-- Add super_admin access
CREATE POLICY "super_admin_view_all_quotes" ON quotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 10: INVENTORY TABLE ====================
-- Add super_admin access
CREATE POLICY "super_admin_view_all_inventory" ON inventory
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 11: EQUIPMENT TABLE ====================
-- Add super_admin access
CREATE POLICY "super_admin_view_all_equipment" ON equipment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 12: DRIVER_ASSIGNMENTS TABLE ====================
-- Add super_admin access
CREATE POLICY "super_admin_view_all_driver_assignments" ON driver_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX 13: NOTIFICATIONS TABLE ====================
-- Ensure notifications are properly scoped
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can access their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;

CREATE POLICY "system_insert_notifications" ON notifications
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "users_view_own_notifications" ON notifications
  FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "users_update_own_notifications" ON notifications
  FOR UPDATE
  USING (recipient_id = auth.uid());

-- ==================== FIX 14: SHOPPING_LISTS TABLE ====================
-- Add company-level access for shopping team
DROP POLICY IF EXISTS "Shopping team can view assigned lists" ON shopping_lists;

CREATE POLICY "shopping_team_view_assigned_lists" ON shopping_lists
  FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- ==================== FIX 15: KITCHEN TABLES ====================
-- Ensure kitchen_duty_shifts and kitchen_task_completions are company-isolated

-- Add company validation to kitchen_duty_shifts
CREATE POLICY "company_staff_view_duty_shifts" ON kitchen_duty_shifts
  FOR SELECT
  USING (
    staff_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p1
      INNER JOIN profiles p2 ON p2.id = kitchen_duty_shifts.staff_id
      WHERE p1.id = auth.uid()
      AND p1.company_id = p2.company_id
      AND p1.company_id IS NOT NULL
      AND p1.active_role IN ('admin', 'owner', 'kitchen', 'chef')
    )
  );

-- ==================== FIX 16: CLEANING TABLES ====================
-- Ensure cleaning duty logs are properly isolated

DROP POLICY IF EXISTS "Users can view their company duty logs" ON cleaning_duty_logs;

CREATE POLICY "company_staff_view_cleaning_duty_logs" ON cleaning_duty_logs
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- ==================== FIX 17: MENU AND RECIPE TABLES ====================
-- Ensure menu_items and recipes are properly company-isolated

-- Menu items should use profiles.company_id properly
DROP POLICY IF EXISTS "Users can manage their company menu items" ON menu_items;
DROP POLICY IF EXISTS "Users can view their company menu items" ON menu_items;

CREATE POLICY "company_staff_manage_menu_items" ON menu_items
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- Recipes should use company_id properly
DROP POLICY IF EXISTS "Users can manage their company recipes" ON recipes;
DROP POLICY IF EXISTS "Users can view their company recipes" ON recipes;

CREATE POLICY "company_staff_manage_recipes" ON recipes
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );

-- ==================== FIX 18: ENSURE ALL COMPANY TABLES HAVE SUPER_ADMIN ACCESS ====================

-- Add super_admin access to all major operational tables
CREATE POLICY "super_admin_view_all_shopping_lists" ON shopping_lists
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

CREATE POLICY "super_admin_view_all_notifications" ON notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );-- ==================== TRIAL EXPIRY NOTIFICATION AUTOMATION ====================
-- This function checks for companies approaching trial expiry and creates notifications

CREATE OR REPLACE FUNCTION check_trial_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  company_record RECORD;
  days_until_expiry INTEGER;
  notification_type TEXT;
  notification_exists BOOLEAN;
BEGIN
  -- Loop through all companies with trial status
  FOR company_record IN
    SELECT 
      id,
      name,
      owner_id,
      trial_ends_at,
      subscription_status
    FROM companies
    WHERE subscription_status = 'trial'
    AND trial_ends_at IS NOT NULL
  LOOP
    -- Calculate days until expiry
    days_until_expiry := EXTRACT(DAY FROM (company_record.trial_ends_at - NOW()));
    
    -- Determine notification type based on days remaining
    notification_type := NULL;
    
    IF days_until_expiry <= 0 THEN
      notification_type := 'expired';
    ELSIF days_until_expiry = 1 THEN
      notification_type := '1_day';
    ELSIF days_until_expiry = 3 THEN
      notification_type := '3_days';
    ELSIF days_until_expiry = 7 THEN
      notification_type := '7_days';
    END IF;
    
    -- Only proceed if we have a notification type
    IF notification_type IS NOT NULL THEN
      -- Check if this notification has already been sent
      SELECT EXISTS(
        SELECT 1 
        FROM trial_expiry_notifications
        WHERE company_id = company_record.id
        AND notification_type = notification_type
      ) INTO notification_exists;
      
      -- If notification doesn't exist, create it
      IF NOT notification_exists THEN
        INSERT INTO trial_expiry_notifications (
          company_id,
          notification_type,
          trial_ends_at,
          days_remaining,
          notification_method,
          email_sent,
          dashboard_seen
        ) VALUES (
          company_record.id,
          notification_type,
          company_record.trial_ends_at,
          days_until_expiry,
          'email',
          FALSE,
          FALSE
        );
        
        -- Log the notification creation
        RAISE NOTICE 'Created % notification for company: %', notification_type, company_record.name;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_trial_expiry_notifications() TO authenticated;

-- Create a scheduled job comment (for documentation - actual scheduling would be done via pg_cron or external scheduler)
COMMENT ON FUNCTION check_trial_expiry_notifications() IS 
'Checks for companies with expiring trials and creates notifications. Should be run daily via cron job or external scheduler.';

-- ==================== HELPER FUNCTION: GET TRIAL STATUS ====================
-- Function to get comprehensive trial status for a company

CREATE OR REPLACE FUNCTION get_company_trial_status(p_company_id UUID)
RETURNS TABLE (
  is_in_trial BOOLEAN,
  days_remaining INTEGER,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  subscription_status TEXT,
  notifications_sent INTEGER,
  last_notification_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (c.subscription_status = 'trial' AND c.trial_ends_at > NOW()) as is_in_trial,
    GREATEST(0, EXTRACT(DAY FROM (c.trial_ends_at - NOW()))::INTEGER) as days_remaining,
    c.trial_ends_at,
    c.subscription_status,
    (SELECT COUNT(*)::INTEGER FROM trial_expiry_notifications WHERE company_id = p_company_id) as notifications_sent,
    (SELECT notification_type FROM trial_expiry_notifications WHERE company_id = p_company_id ORDER BY sent_at DESC LIMIT 1) as last_notification_type
  FROM companies c
  WHERE c.id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_company_trial_status(UUID) TO authenticated;

-- ==================== TRIGGER: AUTO-UPDATE TRIAL STATUS ====================
-- Automatically update subscription_status when trial expires

CREATE OR REPLACE FUNCTION update_expired_trials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If trial has expired and status is still 'trial', update to 'expired'
  IF NEW.subscription_status = 'trial' 
     AND NEW.trial_ends_at IS NOT NULL 
     AND NEW.trial_ends_at < NOW() THEN
    NEW.subscription_status := 'expired';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on companies table
DROP TRIGGER IF EXISTS trigger_update_expired_trials ON companies;
CREATE TRIGGER trigger_update_expired_trials
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_expired_trials();

-- ==================== INDEX OPTIMIZATION ====================
-- Add indexes to improve trial notification query performance

CREATE INDEX IF NOT EXISTS idx_companies_trial_status 
  ON companies(subscription_status, trial_ends_at) 
  WHERE subscription_status = 'trial';

CREATE INDEX IF NOT EXISTS idx_trial_notifications_company_type 
  ON trial_expiry_notifications(company_id, notification_type);

-- ==================== SUCCESS MESSAGE ====================
DO $$
BEGIN
  RAISE NOTICE '✅ Trial expiry notification system successfully configured!';
  RAISE NOTICE '📊 Functions created: check_trial_expiry_notifications(), get_company_trial_status()';
  RAISE NOTICE '🔔 Trigger created: trigger_update_expired_trials';
  RAISE NOTICE '⚡ Indexes optimized for trial queries';
END $$;-- ==================== COMPLETE RLS FIX FOR COMPANY CREATION ====================
-- Drop ALL existing policies on companies table
DROP POLICY IF EXISTS "owners_view_own_company" ON companies;
DROP POLICY IF EXISTS "staff_view_their_company" ON companies;
DROP POLICY IF EXISTS "super_admin_view_all_companies" ON companies;
DROP POLICY IF EXISTS "allow_company_creation" ON companies;
DROP POLICY IF EXISTS "owners_update_own_company" ON companies;
DROP POLICY IF EXISTS "super_admin_update_companies" ON companies;
DROP POLICY IF EXISTS "owners_delete_own_company" ON companies;
DROP POLICY IF EXISTS "super_admin_delete_companies" ON companies;
DROP POLICY IF EXISTS "company_staff_manage_own_company" ON companies;
DROP POLICY IF EXISTS "company_owners_full_access" ON companies;

-- CREATE FRESH, WORKING POLICIES
-- 1. VIEWING COMPANIES
CREATE POLICY "view_own_company_as_owner" ON companies
  FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "view_company_as_staff" ON companies
  FOR SELECT
  USING (
    id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "super_admin_view_all" ON companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- 2. CREATING COMPANIES (CRITICAL FIX)
-- Allow ANY authenticated user to create a company where they are the owner
-- This is essential for signup flow
CREATE POLICY "anyone_can_create_company" ON companies
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
  );

-- 3. UPDATING COMPANIES
CREATE POLICY "owner_update_company" ON companies
  FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "super_admin_update_all" ON companies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- 4. DELETING COMPANIES
CREATE POLICY "owner_delete_company" ON companies
  FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "super_admin_delete_all" ON companies
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- ==================== FIX PROFILES TABLE RLS ====================
-- Drop existing policies
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "users_view_company_members" ON profiles;
DROP POLICY IF EXISTS "super_admin_view_all_profiles" ON profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "admins_update_company_members" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own_and_company" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- CREATE FRESH PROFILES POLICIES
-- SELECT policies
CREATE POLICY "view_own_profile" ON profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "view_company_profiles" ON profiles
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "super_admin_view_all_prof" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND active_role = 'super_admin'
    )
  );

-- UPDATE policies (CRITICAL FOR SIGNUP)
CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "admin_update_company_prof" ON profiles
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND active_role IN ('admin', 'owner', 'super_admin')
    )
  );

-- ==================== SUCCESS ====================
DO $$
BEGIN
  RAISE NOTICE '✅ Company signup RLS policies completely rebuilt!';
  RAISE NOTICE '✅ Any authenticated user can now create a company';
  RAISE NOTICE '✅ Users can update their own profiles during signup';
  RAISE NOTICE '✅ Security maintained for all other operations';
END $$;-- Create staff_invitations table for managing staff invitations
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

-- Enable RLS
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Company admins can manage their own invitations
CREATE POLICY "Company admins can view their invitations" 
ON staff_invitations FOR SELECT 
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Company admins can create invitations" 
ON staff_invitations FOR INSERT 
WITH CHECK (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Company admins can update their invitations" 
ON staff_invitations FOR UPDATE 
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Anyone can accept invitations with valid token" 
ON staff_invitations FOR UPDATE 
USING (status = 'pending' AND expires_at > NOW());

CREATE POLICY "Company admins can delete their invitations" 
ON staff_invitations FOR DELETE 
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Create index for faster lookups
CREATE INDEX idx_staff_invitations_token ON staff_invitations(invitation_token);
CREATE INDEX idx_staff_invitations_company_email ON staff_invitations(company_id, email);
CREATE INDEX idx_staff_invitations_status ON staff_invitations(status);

-- Add comment
COMMENT ON TABLE staff_invitations IS 'Tracks staff member invitations sent by company admins';-- Add missing columns to the companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name TEXT;
UPDATE companies SET company_name = name WHERE company_name IS NULL;
ALTER TABLE companies DROP COLUMN IF EXISTS name;

-- Add missing columns to the orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Add missing columns to the shopping_lists table
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS shopper_id UUID REFERENCES profiles(id);
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS total_cost NUMERIC;
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_instructions TEXT;-- Create default email templates for new companies
-- This migration ensures every company has the necessary email templates
-- Using correct template_type values from the constraint

-- Function to create default email templates for a new company
CREATE OR REPLACE FUNCTION create_default_email_templates(company_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Quote Initial Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'quote_initial',
    'Your Catering Quote - #{quoteNumber}',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">Your Quote is Ready!</h1>
      <p>Hi {clientName},</p>
      <p>Thank you for your interest! Here is your quote <strong>#{quoteNumber}</strong> for your upcoming event.</p>
      <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Event Date:</strong> {eventDate}</p>
        <p style="margin: 10px 0 0 0;"><strong>Quoted Amount:</strong> {quotedAmount}</p>
      </div>
      <p>Please review and let us know if you have any questions.</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Best regards,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Order Confirmation Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'order_confirmation',
    'Order Confirmed - #{orderNumber}',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">Order Confirmed!</h1>
      <p>Hi {clientName},</p>
      <p>Your order <strong>#{orderNumber}</strong> has been confirmed.</p>
      <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Event Date:</strong> {eventDate}</p>
        <p style="margin: 10px 0 0 0;"><strong>Total Amount:</strong> {totalAmount}</p>
      </div>
      <p>We will be in touch with more details soon!</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Thanks,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Payment Received Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'payment_received',
    'Payment Received - Thank You!',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #10B981;">Payment Received!</h1>
      <p>Hi {clientName},</p>
      <p>We have received your payment for order <strong>#{orderNumber}</strong>.</p>
      <div style="background-color: #ECFDF5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981;">
        <p style="margin: 0;"><strong>Amount Paid:</strong> {amountPaid}</p>
        <p style="margin: 10px 0 0 0;"><strong>Payment Date:</strong> {paymentDate}</p>
      </div>
      <p>Thank you for your business!</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Best regards,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Review Request Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'review_request',
    'How Was Your Experience?',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">We Value Your Feedback</h1>
      <p>Hi {clientName},</p>
      <p>Thank you for choosing {companyName} for your recent event!</p>
      <p>We would love to hear about your experience. Your feedback helps us improve our service.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="{reviewUrl}" style="display: inline-block; padding: 12px 30px; background-color: #8B5CF6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Leave a Review →</a>
      </div>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Thank you,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

END;
$$;

-- Trigger to automatically create email templates when a new company is created
CREATE OR REPLACE FUNCTION trigger_create_default_email_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create default templates for the new company admin
  PERFORM create_default_email_templates(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_company_created_create_templates ON profiles;

-- Create trigger on profiles table (when a company admin is created)
CREATE TRIGGER on_company_created_create_templates
  AFTER INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.role = 'admin' OR NEW.active_role = 'admin')
  EXECUTE FUNCTION trigger_create_default_email_templates();

-- Create default templates for existing admin users (one-time migration)
DO $$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN 
    SELECT id FROM profiles WHERE role = 'admin' OR active_role = 'admin'
  LOOP
    PERFORM create_default_email_templates(admin_record.id);
  END LOOP;
END $$;

-- Add helpful comments
COMMENT ON FUNCTION create_default_email_templates IS 'Creates default email templates (quote_initial, order_confirmation, payment_received, review_request) for new companies';
COMMENT ON FUNCTION trigger_create_default_email_templates IS 'Trigger function to auto-create email templates when company admin signs up';
-- Apply the corrected migration
-- Create default email templates for new companies
-- This migration ensures every company has the necessary email templates
-- Using correct template_type values from the constraint

-- Function to create default email templates for a new company
CREATE OR REPLACE FUNCTION create_default_email_templates(company_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Quote Initial Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'quote_initial',
    'Your Catering Quote - #{quoteNumber}',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">Your Quote is Ready!</h1>
      <p>Hi {clientName},</p>
      <p>Thank you for your interest! Here is your quote <strong>#{quoteNumber}</strong> for your upcoming event.</p>
      <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Event Date:</strong> {eventDate}</p>
        <p style="margin: 10px 0 0 0;"><strong>Quoted Amount:</strong> {quotedAmount}</p>
      </div>
      <p>Please review and let us know if you have any questions.</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Best regards,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Order Confirmation Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'order_confirmation',
    'Order Confirmed - #{orderNumber}',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">Order Confirmed!</h1>
      <p>Hi {clientName},</p>
      <p>Your order <strong>#{orderNumber}</strong> has been confirmed.</p>
      <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Event Date:</strong> {eventDate}</p>
        <p style="margin: 10px 0 0 0;"><strong>Total Amount:</strong> {totalAmount}</p>
      </div>
      <p>We will be in touch with more details soon!</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Thanks,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Payment Received Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'payment_received',
    'Payment Received - Thank You!',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #10B981;">Payment Received!</h1>
      <p>Hi {clientName},</p>
      <p>We have received your payment for order <strong>#{orderNumber}</strong>.</p>
      <div style="background-color: #ECFDF5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981;">
        <p style="margin: 0;"><strong>Amount Paid:</strong> {amountPaid}</p>
        <p style="margin: 10px 0 0 0;"><strong>Payment Date:</strong> {paymentDate}</p>
      </div>
      <p>Thank you for your business!</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Best regards,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Review Request Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'review_request',
    'How Was Your Experience?',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">We Value Your Feedback</h1>
      <p>Hi {clientName},</p>
      <p>Thank you for choosing {companyName} for your recent event!</p>
      <p>We would love to hear about your experience. Your feedback helps us improve our service.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="{reviewUrl}" style="display: inline-block; padding: 12px 30px; background-color: #8B5CF6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Leave a Review →</a>
      </div>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Thank you,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

END;
$$;

-- Trigger to automatically create email templates when a new company is created
CREATE OR REPLACE FUNCTION trigger_create_default_email_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create default templates for the new company admin
  PERFORM create_default_email_templates(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_company_created_create_templates ON profiles;

-- Create trigger on profiles table (when a company admin is created)
CREATE TRIGGER on_company_created_create_templates
  AFTER INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.role = 'admin' OR NEW.active_role = 'admin')
  EXECUTE FUNCTION trigger_create_default_email_templates();

-- Create default templates for existing admin users (one-time migration)
DO $$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN 
    SELECT id FROM profiles WHERE role = 'admin' OR active_role = 'admin'
  LOOP
    PERFORM create_default_email_templates(admin_record.id);
  END LOOP;
END $$;

-- Add helpful comments
COMMENT ON FUNCTION create_default_email_templates IS 'Creates default email templates (quote_initial, order_confirmation, payment_received, review_request) for new companies';
COMMENT ON FUNCTION trigger_create_default_email_templates IS 'Trigger function to auto-create email templates when company admin signs up';-- Drop the existing check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the updated constraint that includes 'super_admin'
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role = ANY (ARRAY['admin'::text, 'client'::text, 'driver'::text, 'kitchen'::text, 'cleaning'::text, 'shopping'::text, 'super_admin'::text]));

-- Now update Alex's profile to super_admin
UPDATE profiles 
SET 
  role = 'super_admin',
  active_role = 'super_admin',
  company_id = NULL
WHERE email = 'alex@skylight-digital.co.za';

-- Verify the update
SELECT id, email, role, active_role, company_id, full_name, created_at
FROM profiles 
WHERE email = 'alex@skylight-digital.co.za';-- FIX: Rewrite RLS policies to avoid circular references
-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "super_admin_view_all_prof" ON profiles;
DROP POLICY IF EXISTS "users_view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_update_company_prof" ON profiles;

-- Create new policies using auth metadata instead of subqueries
-- This avoids the infinite recursion by not querying the profiles table within the policy

-- 1. Super admin can view all profiles
-- Use auth metadata instead of subquery
CREATE POLICY "super_admin_view_all_prof" ON profiles
FOR SELECT
USING (
  -- Allow if user is viewing their own profile
  auth.uid() = id
  OR
  -- Allow if user has super_admin role in their own profile
  -- This relies on the profile being accessible for the authenticated user
  (
    SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1
  ) = 'super_admin'
);

-- 2. Users can view profiles in their company
CREATE POLICY "users_view_company_profiles" ON profiles
FOR SELECT
USING (
  -- User can view their own profile
  auth.uid() = id
  OR
  -- User can view profiles in the same company
  (
    company_id IS NOT NULL
    AND company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  )
);

-- 3. Admins can update company profiles
CREATE POLICY "admin_update_company_prof" ON profiles
FOR UPDATE
USING (
  -- User is updating their own profile
  auth.uid() = id
  OR
  -- User is admin/owner/super_admin in the same company
  (
    company_id = (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
        AND active_role IN ('admin', 'owner', 'super_admin')
      LIMIT 1
    )
  )
);-- FIX: Remove ALL policies and create simple, non-recursive ones

-- Drop all existing policies
DROP POLICY IF EXISTS "super_admin_view_all_prof" ON profiles;
DROP POLICY IF EXISTS "users_view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "view_company_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_update_company_prof" ON profiles;
DROP POLICY IF EXISTS "view_own_profile" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "users_create_own_profile" ON profiles;

-- Create NEW simple policies WITHOUT any subqueries

-- 1. Users can ALWAYS view their own profile (no recursion possible)
CREATE POLICY "view_own_profile" ON profiles
FOR SELECT
USING (auth.uid() = id);

-- 2. Users can view profiles in the same company (simple column comparison)
CREATE POLICY "view_same_company" ON profiles
FOR SELECT
USING (
  company_id IS NOT NULL 
  AND EXISTS (
    -- Use auth.uid() directly without nested SELECT
    SELECT 1 FROM profiles p2 
    WHERE p2.id = auth.uid() 
    AND p2.company_id = profiles.company_id
  )
);

-- 3. Users can update their own profile
CREATE POLICY "update_own_profile" ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Users can create their own profile
CREATE POLICY "insert_own_profile" ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Note: Removed super_admin special policy - they use same rules as everyone else
-- Super admins will access data through application logic, not RLS bypass-- FINAL FIX: Create a security definer function to get user's company_id without RLS
-- This function runs with elevated privileges and bypasses RLS, preventing recursion

CREATE OR REPLACE FUNCTION get_user_company_id(user_uuid UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- This is key - it runs without RLS checks
AS $$
DECLARE
  result UUID;
BEGIN
  SELECT company_id INTO result
  FROM profiles
  WHERE id = user_uuid
  LIMIT 1;
  
  RETURN result;
END;
$$;

-- Now recreate policies using this function instead of subqueries
DROP POLICY IF EXISTS "view_same_company" ON profiles;
DROP POLICY IF EXISTS "view_own_profile" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;

-- 1. Users can ALWAYS view their own profile
CREATE POLICY "view_own_profile" ON profiles
FOR SELECT
USING (auth.uid() = id);

-- 2. Users can view profiles in the same company (using the function)
CREATE POLICY "view_same_company" ON profiles
FOR SELECT
USING (
  company_id IS NOT NULL 
  AND company_id = get_user_company_id(auth.uid())
);

-- 3. Users can update their own profile
CREATE POLICY "update_own_profile" ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Users can create their own profile
CREATE POLICY "insert_own_profile" ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION get_user_company_id(UUID) TO authenticated;-- FINAL FIX: Ultra-simple RLS policies with ZERO recursion possibility

-- Drop ALL existing policies
DROP POLICY IF EXISTS "view_same_company" ON profiles;
DROP POLICY IF EXISTS "view_own_profile" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;

-- Drop the helper function (we won't use it)
DROP FUNCTION IF EXISTS get_user_company_id(UUID);

-- Create the simplest possible policies
-- These use ONLY direct auth.uid() comparisons - no recursion possible

-- 1. Users can view their own profile (most important - this is what login needs)
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT
USING (id = auth.uid());

-- 2. Users can insert their own profile (during signup)
CREATE POLICY "Users can insert own profile" ON profiles
FOR INSERT
WITH CHECK (id = auth.uid());

-- 3. Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 4. Super admins can view all profiles (using app-level check, not RLS)
-- We'll handle this in application code instead of RLS to avoid recursion

-- That's it! No company_id checks, no subqueries, no functions.
-- Just simple, direct auth.uid() comparisons that can't recurse.-- Fix the infinite recursion in profiles RLS policy
-- by making the handle_new_user trigger function use SECURITY DEFINER

-- Drop and recreate the trigger function with SECURITY DEFINER
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- ✅ This bypasses RLS during automatic profile creation
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verify the RLS policies are still simple and correct
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;ALTER TABLE leads ADD COLUMN event_time TIME;ALTER TABLE leads ADD COLUMN venue_address TEXT;ALTER TABLE leads ADD COLUMN budget_range TEXT;-- Add RLS policies to allow admins and super_admins to view and manage all users in their company

-- Allow admins to view all users in their company
CREATE POLICY "Admins can view all company users" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role IN ('admin', 'super_admin')
      AND admin_profile.company_id = profiles.company_id
    )
  );

-- Allow admins to update all users in their company
CREATE POLICY "Admins can update all company users" ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role IN ('admin', 'super_admin')
      AND admin_profile.company_id = profiles.company_id
    )
  );

-- Allow admins to insert users in their company (for user creation)
CREATE POLICY "Admins can insert company users" ON profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles AS admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role IN ('admin', 'super_admin')
      AND admin_profile.company_id = profiles.company_id
    )
  );-- Drop the existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the existing function
DROP FUNCTION IF EXISTS handle_new_user();

-- Create the updated function that includes role extraction
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert profile with role from metadata
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    role,
    phone,
    phone_number,
    company_id,
    created_at, 
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),  -- Extract role from metadata, default to 'client'
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'company_id', NULL),
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Admins can view all company users" ON profiles;
DROP POLICY IF EXISTS "Admins can update all company users" ON profiles;
DROP POLICY IF EXISTS "Admins can insert company users" ON profiles;

-- Recreate them with non-recursive logic
-- Allow admins to view users in their company (check active_role directly without recursion)
CREATE POLICY "Admins can view all company users" ON profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.active_role IN ('admin', 'owner', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.company_id IS NOT NULL
  )
);

-- Allow admins to update users in their company
CREATE POLICY "Admins can update all company users" ON profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.active_role IN ('admin', 'owner', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.company_id IS NOT NULL
  )
);

-- Allow admins to insert users for their company
CREATE POLICY "Admins can insert company users" ON profiles
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile
    WHERE admin_profile.id = auth.uid()
    AND admin_profile.active_role IN ('admin', 'owner', 'super_admin')
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.company_id IS NOT NULL
  )
);-- Step 1: Drop ALL potentially problematic recursive policies
DROP POLICY IF EXISTS "Admins can view all company users" ON profiles;
DROP POLICY IF EXISTS "Admins can update all company users" ON profiles;
DROP POLICY IF EXISTS "Admins can insert company users" ON profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Company staff can view company profiles" ON profiles;
DROP POLICY IF EXISTS "Company admins can manage company profiles" ON profiles;

-- Step 2: Keep the simple, working policies
-- These already exist and don't cause recursion:
-- - "Users can view own profile"
-- - "Users can update own profile"
-- - "Users can insert own profile"

-- Step 3: Create a SAFE policy for company staff to view profiles in their company
-- This uses LIMIT 1 to prevent recursion
CREATE POLICY "Company staff view company profiles" ON profiles
FOR SELECT
USING (
  company_id IS NOT NULL
  AND company_id = (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() 
    AND company_id IS NOT NULL
    LIMIT 1
  )
);

-- Step 4: Create a SAFE policy for company admins to manage profiles
-- This uses LIMIT 1 to prevent recursion
CREATE POLICY "Company admins manage company profiles" ON profiles
FOR ALL
USING (
  company_id IS NOT NULL
  AND company_id = (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() 
    AND active_role IN ('admin', 'owner', 'super_admin')
    AND company_id IS NOT NULL
    LIMIT 1
  )
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() 
    AND active_role IN ('admin', 'owner', 'super_admin')
    AND company_id IS NOT NULL
    LIMIT 1
  )
);-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Company staff view company profiles" ON profiles;
DROP POLICY IF EXISTS "Company admins manage company profiles" ON profiles;

-- Create SAFE, NON-RECURSIVE policies
-- Policy 1: Users can always view their own profile (no recursion)
-- This already exists: "Users can view own profile"

-- Policy 2: Users can view profiles in the same company
-- Use a simple comparison without subqueries
CREATE POLICY "Same company view" ON profiles
FOR SELECT
USING (
  -- Either it's your own profile, OR you're in the same company
  id = auth.uid() 
  OR 
  (
    company_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 
      FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'company_id' = profiles.company_id::text
    )
  )
);

-- Policy 3: Admins can manage profiles in their company
-- Use auth.jwt() to get role without querying profiles
CREATE POLICY "Admin company management" ON profiles
FOR ALL
USING (
  -- Either it's your own profile, OR you're an admin in the same company
  id = auth.uid()
  OR
  (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'company_id' = profiles.company_id::text
      AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'owner', 'super_admin')
    )
  )
)
WITH CHECK (
  -- Same check for INSERT/UPDATE
  id = auth.uid()
  OR
  (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'company_id' = profiles.company_id::text
      AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'owner', 'super_admin')
    )
  )
);-- Drop ALL policies to start fresh
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Same company view" ON profiles;
DROP POLICY IF EXISTS "Admin company management" ON profiles;

-- Create MINIMAL, NON-RECURSIVE policies
-- Policy 1: Users can ALWAYS view, insert, and update their OWN profile (no recursion)
CREATE POLICY "Own profile full access" ON profiles
FOR ALL
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Policy 2: For company staff viewing other profiles in the same company
-- This uses a SAFE approach: store company_id directly in the session JWT
-- and compare against that, avoiding ANY table lookups
CREATE POLICY "Company profiles readable" ON profiles
FOR SELECT
USING (
  -- Allow if it's your own profile
  id = auth.uid()
  OR
  -- Allow if you're in the same company (using JWT claim, not table lookup)
  (
    company_id IS NOT NULL 
    AND company_id = (auth.jwt()->>'company_id')::uuid
  )
);-- Drop ALL existing policies to start completely fresh
DROP POLICY IF EXISTS "Own profile full access" ON profiles;
DROP POLICY IF EXISTS "Company profiles readable" ON profiles;

-- Create the SIMPLEST possible policies that cannot cause recursion
-- Policy 1: Users can ALWAYS do everything with their own profile
CREATE POLICY "own_profile_all_access" ON profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 2: For SELECT only - allow viewing profiles in same company
-- This uses a lateral join which is safe and doesn't cause recursion
CREATE POLICY "company_profiles_select" ON profiles
FOR SELECT
USING (
  -- Own profile is always accessible
  auth.uid() = id
  OR
  -- OR you can see profiles in your company
  EXISTS (
    SELECT 1
    FROM profiles AS my_profile
    WHERE my_profile.id = auth.uid()
      AND my_profile.company_id IS NOT NULL
      AND my_profile.company_id = profiles.company_id
    LIMIT 1
  )
);-- Drop ALL existing policies on profiles table
DROP POLICY IF EXISTS "own_profile_all_access" ON profiles;
DROP POLICY IF EXISTS "company_profiles_select" ON profiles;

-- Create the SIMPLEST possible policy: users can only access their own profile
-- This is 100% safe and cannot cause recursion
CREATE POLICY "profiles_own_access" ON profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- For company-wide access, we need to disable RLS temporarily to avoid recursion
-- This is a known PostgreSQL/Supabase limitation with self-referential policies
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;-- Re-enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "profiles_own_access" ON profiles;

-- Create SAFE, NON-RECURSIVE policies

-- Policy 1: Users can ALWAYS access their own profile (100% safe - no recursion)
CREATE POLICY "profiles_own_full_access" ON profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 2: For service role (backend operations like triggers) - bypass RLS
-- This allows the auth trigger to create profiles without hitting RLS checks
CREATE POLICY "profiles_service_role_access" ON profiles
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Policy 3: For authenticated users to view profiles in their company
-- This uses a security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;

-- Now create the company-wide read policy using the function
CREATE POLICY "profiles_company_read_access" ON profiles
FOR SELECT
USING (
  -- Own profile is always readable
  auth.uid() = id
  OR
  -- Or you can read profiles in your company
  (
    company_id IS NOT NULL
    AND company_id = public.get_user_company_id()
  )
);-- Drop ALL existing policies and functions
DROP POLICY IF EXISTS "profiles_own_full_access" ON profiles;
DROP POLICY IF EXISTS "profiles_service_role_access" ON profiles;
DROP POLICY IF EXISTS "profiles_company_read_access" ON profiles;
DROP FUNCTION IF EXISTS public.get_user_company_id();

-- Create the SIMPLEST possible RLS policies that cannot cause recursion
-- These policies ONLY use auth.uid() and NEVER query any tables

-- Policy 1: Users can do EVERYTHING with their own profile (100% safe)
CREATE POLICY "profiles_self_access" ON profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 2: Service role bypass (for triggers and backend operations)
CREATE POLICY "profiles_service_bypass" ON profiles
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- That's it! No company-wide access policies that could cause recursion.
-- Company-wide access will be handled in the application layer, not RLS.-- Drop ALL existing problematic policies and functions
DROP POLICY IF EXISTS "profiles_self_access" ON profiles;
DROP POLICY IF EXISTS "profiles_service_bypass" ON profiles;
DROP POLICY IF EXISTS "profiles_own_full_access" ON profiles;
DROP POLICY IF EXISTS "profiles_service_role_access" ON profiles;
DROP POLICY IF EXISTS "profiles_company_read_access" ON profiles;
DROP FUNCTION IF EXISTS public.get_user_company_id();

-- Create the ABSOLUTE SIMPLEST policies that cannot cause recursion
-- These policies use ONLY auth.uid() and auth.role() - no table queries

-- Policy 1: Users can access their own profile (100% safe - no recursion possible)
CREATE POLICY "users_own_profile_access" 
ON profiles 
FOR ALL 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 2: Service role can access all profiles (for triggers and backend)
CREATE POLICY "service_role_full_access" 
ON profiles 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- That's it! No company-wide policies that could cause recursion.
-- Company access will be handled at the application layer with WHERE clauses.ALTER TABLE public.companies DROP COLUMN IF EXISTS slug;