-- =====================================================
-- COMPREHENSIVE SCHEMA FIX MIGRATION - Part 3 (Fixed)
-- Create remaining missing tables and update enums properly
-- =====================================================

-- Create equipment_handovers table
CREATE TABLE IF NOT EXISTS equipment_handovers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES equipment_inventory(id) ON DELETE CASCADE,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  handed_over_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  received_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  handover_time timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_handovers_from_stage_check CHECK (from_stage IN ('kitchen', 'driver', 'venue', 'cleaning')),
  CONSTRAINT equipment_handovers_to_stage_check CHECK (to_stage IN ('kitchen', 'driver', 'venue', 'cleaning'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_handovers_order ON equipment_handovers(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_handovers_equipment ON equipment_handovers(equipment_id);

-- Create kitchen_task_completions table
CREATE TABLE IF NOT EXISTS kitchen_task_completions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  completed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_task_completions_order ON kitchen_task_completions(order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_task_completions_completed_by ON kitchen_task_completions(completed_by);

-- Create trial_expiry_notifications table
CREATE TABLE IF NOT EXISTS trial_expiry_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trial_expiry_notifications_type_check CHECK (notification_type IN ('7_days', '3_days', '1_day', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_trial_expiry_notifications_company ON trial_expiry_notifications(company_id);

-- Create financial_predictions table
CREATE TABLE IF NOT EXISTS financial_predictions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prediction_date date NOT NULL,
  predicted_revenue numeric(12,2) NOT NULL,
  predicted_expenses numeric(12,2) NOT NULL,
  predicted_cashflow numeric(12,2) NOT NULL,
  confidence_score numeric(5,2) NOT NULL,
  risk_level text NOT NULL,
  recommendations jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_predictions_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS idx_financial_predictions_company ON financial_predictions(company_id);
CREATE INDEX IF NOT EXISTS idx_financial_predictions_date ON financial_predictions(prediction_date);

-- Create onboarding_state table
CREATE TABLE IF NOT EXISTS onboarding_state (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  checklist jsonb NOT NULL DEFAULT '{}',
  progress numeric(5,2) NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_state_user ON onboarding_state(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_state_company ON onboarding_state(company_id);

-- Create recipe_scaling_history table
CREATE TABLE IF NOT EXISTS recipe_scaling_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_guest_count integer NOT NULL,
  new_guest_count integer NOT NULL,
  scaling_factor numeric(10,4) NOT NULL,
  ingredient_adjustments jsonb,
  adjusted_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_scaling_history_order ON recipe_scaling_history(order_id);

-- Create inventory_batches table
CREATE TABLE IF NOT EXISTS inventory_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  quantity numeric(10,2) NOT NULL,
  expiry_date date,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_batches_status_check CHECK (status IN ('active', 'expired', 'depleted'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_company ON inventory_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_item ON inventory_batches(inventory_item_id);

-- Create staff_work_sessions table
CREATE TABLE IF NOT EXISTS staff_work_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  total_hours numeric(6,2),
  total_earnings numeric(10,2),
  session_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_work_sessions_staff ON staff_work_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_work_sessions_company ON staff_work_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_staff_work_sessions_date ON staff_work_sessions(session_date);

-- Update payment_status enum to include 'partial' and 'paid'
DO $$
BEGIN
  -- Add 'partial' if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'partial' AND enumtypid = 'payment_status'::regtype) THEN
    ALTER TYPE payment_status ADD VALUE 'partial';
  END IF;
  
  -- Add 'paid' if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'paid' AND enumtypid = 'payment_status'::regtype) THEN
    ALTER TYPE payment_status ADD VALUE 'paid';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- payment_status enum doesn't exist, skip
    NULL;
END $$;

-- Update order_status enum to include 'preparing' and 'in_transit'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'preparing' AND enumtypid = 'order_status'::regtype) THEN
    ALTER TYPE order_status ADD VALUE 'preparing';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'in_transit' AND enumtypid = 'order_status'::regtype) THEN
    ALTER TYPE order_status ADD VALUE 'in_transit';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Update quote_status enum to include 'revised' and 'pending'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'revised' AND enumtypid = 'quote_status'::regtype) THEN
    ALTER TYPE quote_status ADD VALUE 'revised';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending' AND enumtypid = 'quote_status'::regtype) THEN
    ALTER TYPE quote_status ADD VALUE 'pending';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Update lead_status enum to include 'manual_add'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'manual_add' AND enumtypid = 'lead_status'::regtype) THEN
    ALTER TYPE lead_status ADD VALUE 'manual_add';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Update subscription_status enum to include 'trialing'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'trialing' AND enumtypid = 'subscription_status'::regtype) THEN
    ALTER TYPE subscription_status ADD VALUE 'trialing';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Add RLS policies for new tables
ALTER TABLE equipment_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_expiry_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_scaling_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_work_sessions ENABLE ROW LEVEL SECURITY;

-- Add basic RLS policies (users can read their own company data)
CREATE POLICY "Users can view equipment handovers" ON equipment_handovers FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "Users can view kitchen task completions" ON kitchen_task_completions FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "Admins can view trial notifications" ON trial_expiry_notifications FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can view their company predictions" ON financial_predictions FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can view their onboarding state" ON onboarding_state FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update their onboarding state" ON onboarding_state FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can view recipe scaling history" ON recipe_scaling_history FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "Users can view their company inventory batches" ON inventory_batches FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can view staff work sessions" ON staff_work_sessions FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR staff_id = auth.uid());

COMMENT ON TABLE equipment_handovers IS 'Equipment handover tracking between stages';
COMMENT ON TABLE kitchen_task_completions IS 'Kitchen task completion tracking';
COMMENT ON TABLE trial_expiry_notifications IS 'Trial expiry notification tracking';
COMMENT ON TABLE financial_predictions IS 'AI-generated financial predictions';
COMMENT ON TABLE onboarding_state IS 'User onboarding progress tracking';
COMMENT ON TABLE recipe_scaling_history IS 'Recipe scaling history for orders';
COMMENT ON TABLE inventory_batches IS 'Inventory batch tracking with expiry dates';
COMMENT ON TABLE staff_work_sessions IS 'Staff work session and time tracking';