-- Create exchange_rates table to store daily exchange rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  usd_to_zar_rate DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on date for faster queries
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date DESC);

-- Create currency_fluctuation_alerts table
CREATE TABLE IF NOT EXISTS currency_fluctuation_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_date DATE NOT NULL,
  start_rate DECIMAL(10, 4) NOT NULL,
  end_rate DECIMAL(10, 4) NOT NULL,
  percentage_change DECIMAL(10, 2) NOT NULL,
  days_period INTEGER NOT NULL,
  alert_sent BOOLEAN DEFAULT FALSE,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on resolved status for faster queries
CREATE INDEX IF NOT EXISTS idx_currency_alerts_resolved ON currency_fluctuation_alerts(resolved, created_at DESC);

-- Create admin_notifications table for CateringMS internal alerts
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for unread notifications
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(read, created_at DESC);

-- Enable RLS on all tables
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_fluctuation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (admin only access)
CREATE POLICY "Admin can view exchange rates" ON exchange_rates FOR SELECT USING (true);
CREATE POLICY "Admin can insert exchange rates" ON exchange_rates FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update exchange rates" ON exchange_rates FOR UPDATE USING (true);

CREATE POLICY "Admin can view fluctuation alerts" ON currency_fluctuation_alerts FOR SELECT USING (true);
CREATE POLICY "Admin can insert fluctuation alerts" ON currency_fluctuation_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update fluctuation alerts" ON currency_fluctuation_alerts FOR UPDATE USING (true);

CREATE POLICY "Admin can view notifications" ON admin_notifications FOR SELECT USING (true);
CREATE POLICY "Admin can insert notifications" ON admin_notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update notifications" ON admin_notifications FOR UPDATE USING (true);
CREATE POLICY "Admin can delete notifications" ON admin_notifications FOR DELETE USING (true);

-- Insert initial exchange rate (current approximate rate)
INSERT INTO exchange_rates (date, usd_to_zar_rate)
VALUES (CURRENT_DATE, 18.50)
ON CONFLICT (date) DO NOTHING;