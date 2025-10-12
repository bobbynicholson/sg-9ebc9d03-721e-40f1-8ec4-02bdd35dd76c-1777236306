-- Add missing deposit and balance tracking fields to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS balance_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS balance_due_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS balance_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS balance_paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_change_allowed_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS final_guest_count INTEGER,
ADD COLUMN IF NOT EXISTS final_order_confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS payment_gateway TEXT;

-- Add index for payment tracking
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_balance_due ON orders(balance_due_date) WHERE balance_paid = false;

-- Update status check constraint to include all lifecycle stages
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending_deposit',
  'deposit_paid', 
  'confirmed',
  'assigned',
  'in_preparation',
  'ready_for_delivery',
  'in_transit',
  'delivered',
  'completed',
  'cancelled'
));

COMMENT ON COLUMN orders.deposit_amount IS 'Initial deposit required to confirm booking';
COMMENT ON COLUMN orders.balance_due_date IS 'Date by which final balance must be paid';
COMMENT ON COLUMN orders.last_change_allowed_date IS 'Last date client can modify order details';
COMMENT ON COLUMN orders.final_guest_count IS 'Confirmed guest count after final modifications';