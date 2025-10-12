-- =====================================================
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
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);