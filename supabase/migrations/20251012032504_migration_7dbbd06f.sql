-- Create equipment_shortage_flags table
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
COMMENT ON COLUMN equipment_shortage_flags.financial_impact IS 'Estimated financial loss or cost to replace missing equipment';