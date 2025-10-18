-- Add missing columns to the companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name TEXT;
UPDATE companies SET company_name = name WHERE company_name IS NULL;
ALTER TABLE companies DROP COLUMN IF EXISTS name;

-- Add missing columns to the orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Add missing columns to the shopping_lists table
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS shopper_id UUID REFERENCES profiles(id);
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS total_cost NUMERIC;
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;