-- =====================================================
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
CREATE POLICY "Users can manage their email templates" ON email_templates FOR ALL USING (auth.uid() = user_id);