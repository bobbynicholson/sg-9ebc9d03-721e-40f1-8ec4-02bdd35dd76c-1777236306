-- Equipment handover tracking table
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
CREATE INDEX idx_equipment_cleaning_status_order ON equipment_cleaning_status(order_id);