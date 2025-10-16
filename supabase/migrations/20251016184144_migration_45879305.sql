-- Phase 4: Add company_id to critical tables for proper data segmentation

-- Add company_id to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to inventory table
ALTER TABLE inventory
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to equipment table
ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to quotes table
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to driver_assignments table
ALTER TABLE driver_assignments
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to notifications table
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to shopping_lists table
ALTER TABLE shopping_lists
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Create indexes for all new company_id columns
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_company_id ON inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_company_id ON equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_company_id ON driver_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company_id ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_company_id ON shopping_lists(company_id);

COMMENT ON COLUMN orders.company_id IS 'The catering company this order belongs to';
COMMENT ON COLUMN inventory.company_id IS 'The catering company that owns this inventory';
COMMENT ON COLUMN equipment.company_id IS 'The catering company that owns this equipment';