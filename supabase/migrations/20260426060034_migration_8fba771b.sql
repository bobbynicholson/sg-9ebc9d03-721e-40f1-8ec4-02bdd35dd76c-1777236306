-- 2. Create order_status_history table if not exists
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "company_own_history" ON order_status_history
  FOR ALL USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN profiles p ON p.company_id = o.company_id
      WHERE p.id = auth.uid()
    )
  );