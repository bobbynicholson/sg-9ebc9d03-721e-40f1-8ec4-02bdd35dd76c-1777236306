-- Add client_id to orders table to associate orders with client profiles
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);