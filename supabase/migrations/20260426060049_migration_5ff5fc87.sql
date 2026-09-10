-- 3. Add missing columns to delivery_route_stops
ALTER TABLE delivery_route_stops 
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES delivery_routes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_arrival_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_arrival_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completion_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index on route_id
CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_route ON delivery_route_stops(route_id);