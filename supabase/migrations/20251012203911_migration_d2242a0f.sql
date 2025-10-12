-- Add missing columns to orders table for delivery and waiter services
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS waiter_service_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS waiter_duration_hours INTEGER CHECK (waiter_duration_hours IN (1, 2, 3)),
ADD COLUMN IF NOT EXISTS waiter_hourly_rate DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS waiter_total_fee DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS delivery_distance_km DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS delivery_rate_per_km DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS delivery_total_fee DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS equipment_return_method TEXT CHECK (equipment_return_method IN ('waiter_return', 'later_collection'));

-- Add missing columns to driver_assignments table
ALTER TABLE driver_assignments
ADD COLUMN IF NOT EXISTS actual_cutlery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_crockery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS collection_cutlery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS collection_crockery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS collection_notes TEXT,
ADD COLUMN IF NOT EXISTS delivery_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS waiter_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS event_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS checklist_food_verified BOOLEAN DEFAULT FALSE;

-- Create equipment_shortages table if not exists
CREATE TABLE IF NOT EXISTS equipment_shortages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    equipment_type TEXT NOT NULL,
    quantity_missing INTEGER NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'written_off')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for equipment_shortages
CREATE INDEX IF NOT EXISTS idx_equipment_shortages_user_id ON equipment_shortages(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortages_order_id ON equipment_shortages(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortages_status ON equipment_shortages(status);

-- Enable RLS on equipment_shortages
ALTER TABLE equipment_shortages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for equipment_shortages
CREATE POLICY "Users can view their own equipment shortages"
    ON equipment_shortages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own equipment shortages"
    ON equipment_shortages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own equipment shortages"
    ON equipment_shortages FOR UPDATE
    USING (auth.uid() = user_id);

-- Create get_order_total function
CREATE OR REPLACE FUNCTION get_order_total(order_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
AS $$
DECLARE
    order_total DECIMAL(10,2);
BEGIN
    SELECT total INTO order_total
    FROM orders
    WHERE id = order_id;
    
    RETURN COALESCE(order_total, 0);
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION get_order_total(UUID) IS 'Returns the total amount for a given order ID';