-- Create equipment shortage flags table
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
  EXECUTE FUNCTION update_equipment_shortage_flags_updated_at();