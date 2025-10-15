-- Create leads table for managing potential customers
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
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);