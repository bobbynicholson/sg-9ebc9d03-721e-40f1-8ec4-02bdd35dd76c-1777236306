-- Create time_clock_entries table for staff clock in/out
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
CREATE INDEX idx_payment_ledger_period ON staff_payment_ledger(payment_period_start, payment_period_end);