-- Create the missing tables that driver service expects
-- 1. Create delivery_routes table if not exists
CREATE TABLE IF NOT EXISTS delivery_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  route_date DATE NOT NULL,
  status TEXT DEFAULT 'planned',
  total_distance NUMERIC(10,2),
  estimated_duration INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE delivery_routes ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "company_own_routes" ON delivery_routes
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );