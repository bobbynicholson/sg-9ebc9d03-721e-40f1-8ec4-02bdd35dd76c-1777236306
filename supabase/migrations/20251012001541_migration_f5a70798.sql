-- Create payment_gateways table for configurable payment processors
CREATE TABLE IF NOT EXISTS payment_gateways (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway_name TEXT NOT NULL,
  gateway_type TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  is_test_mode BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  credentials JSONB DEFAULT '{}',
  supported_currencies TEXT[] DEFAULT '{"ZAR"}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their payment gateways" ON payment_gateways FOR ALL USING (auth.uid() = user_id);

-- Create after_sales_emails table for scheduled follow-up emails
CREATE TABLE IF NOT EXISTS after_sales_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  email_number INTEGER NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_email_number CHECK (email_number BETWEEN 1 AND 6)
);

ALTER TABLE after_sales_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their after sales emails" ON after_sales_emails FOR ALL USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_after_sales_emails_scheduled ON after_sales_emails(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_active ON payment_gateways(user_id, is_active);

-- Create function to calculate driver earnings
CREATE OR REPLACE FUNCTION calculate_driver_earnings()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    NEW.calculated_hours = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 3600;
    NEW.total_earnings = (COALESCE(NEW.hourly_rate, 0) * COALESCE(NEW.calculated_hours, 0)) + 
                        (COALESCE(NEW.rate_per_km, 0) * COALESCE(NEW.calculated_distance, 0));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for driver earnings calculation
DROP TRIGGER IF EXISTS trigger_calculate_driver_earnings ON driver_assignments;
CREATE TRIGGER trigger_calculate_driver_earnings
  BEFORE UPDATE ON driver_assignments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_driver_earnings();

-- Create function to update equipment availability after cleaning
CREATE OR REPLACE FUNCTION update_equipment_availability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'returned' AND OLD.status != 'returned' THEN
    UPDATE equipment 
    SET available_quantity = available_quantity + NEW.quantity,
        next_available_at = NOW() + (cleaning_time_hours || ' hours')::INTERVAL
    WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for equipment availability
DROP TRIGGER IF EXISTS trigger_update_equipment_availability ON equipment_bookings;
CREATE TRIGGER trigger_update_equipment_availability
  AFTER UPDATE ON equipment_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_availability();