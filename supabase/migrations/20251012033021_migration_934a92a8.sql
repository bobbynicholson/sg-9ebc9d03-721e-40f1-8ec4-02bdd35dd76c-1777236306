-- Add waiter service fields to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS requires_waiter BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS waiter_duration_hours INTEGER,
ADD COLUMN IF NOT EXISTS waiter_hourly_rate DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS waiter_total_fee DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS equipment_return_method TEXT DEFAULT 'later_collection' CHECK (equipment_return_method IN ('waiter_return', 'later_collection'));

-- Add pre-departure checklist fields to driver_assignments
ALTER TABLE driver_assignments
ADD COLUMN IF NOT EXISTS checklist_cutlery_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checklist_crockery_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checklist_food_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checklist_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS departure_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS departure_confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_waiter_job BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS waiter_duration_hours INTEGER,
ADD COLUMN IF NOT EXISTS waiter_hourly_rate DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS waiter_earnings DECIMAL(10, 2);

-- Create index for waiter jobs
CREATE INDEX IF NOT EXISTS idx_driver_assignments_waiter ON driver_assignments(is_waiter_job) WHERE is_waiter_job = TRUE;

-- Add helpful comments
COMMENT ON COLUMN orders.requires_waiter IS 'Whether client wants driver to act as waiter for event duration';
COMMENT ON COLUMN orders.waiter_duration_hours IS 'Number of hours driver will act as waiter (1, 2, or 3 hours)';
COMMENT ON COLUMN orders.waiter_hourly_rate IS 'Hourly rate charged to client for waiter service';
COMMENT ON COLUMN orders.waiter_total_fee IS 'Total waiter service fee added to invoice (duration * rate)';
COMMENT ON COLUMN orders.equipment_return_method IS 'How equipment will be returned: waiter_return (driver brings back) or later_collection (separate pickup)';

COMMENT ON COLUMN driver_assignments.checklist_cutlery_confirmed IS 'Driver confirmed cutlery count matches order';
COMMENT ON COLUMN driver_assignments.checklist_crockery_confirmed IS 'Driver confirmed crockery count matches order';
COMMENT ON COLUMN driver_assignments.checklist_food_verified IS 'Driver verified food items against order';
COMMENT ON COLUMN driver_assignments.departure_confirmed IS 'Driver confirmed all checklist items and ready to depart';
COMMENT ON COLUMN driver_assignments.is_waiter_job IS 'Whether this job includes waiter service';
COMMENT ON COLUMN driver_assignments.waiter_earnings IS 'Additional earnings from waiter service for this job';