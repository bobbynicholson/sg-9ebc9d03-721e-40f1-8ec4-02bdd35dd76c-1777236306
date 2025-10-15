-- Create driver_confirmations table for tracking en-route status
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
('driver_replacement_accepted', 'Driver Replacement Accepted', '✅ Great news! {{new_driver_name}} has accepted to handle Order #{{order_number}}. All details updated.', '["new_driver_name", "order_number"]', 'Sent to admin when replacement is accepted', true);