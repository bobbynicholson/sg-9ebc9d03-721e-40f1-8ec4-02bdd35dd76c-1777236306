-- Create kitchen duty shifts table
CREATE TABLE IF NOT EXISTS kitchen_duty_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NULL REFERENCES orders(id) ON DELETE CASCADE,
  shift_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  shift_end TIMESTAMP WITH TIME ZONE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_staff ON kitchen_duty_shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_active ON kitchen_duty_shifts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_order ON kitchen_duty_shifts(order_id);

-- Enable RLS
ALTER TABLE kitchen_duty_shifts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kitchen_duty_shifts
CREATE POLICY "Staff can create their own duty shifts"
  ON kitchen_duty_shifts FOR INSERT
  WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Staff can update their own duty shifts"
  ON kitchen_duty_shifts FOR UPDATE
  USING (auth.uid() = staff_id);

CREATE POLICY "Staff can view duty shifts in their company"
  ON kitchen_duty_shifts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'kitchen', 'chef')
    )
  );

CREATE POLICY "Admins can manage all duty shifts"
  ON kitchen_duty_shifts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Create kitchen task completions table
CREATE TABLE IF NOT EXISTS kitchen_task_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  duty_shift_id UUID NULL REFERENCES kitchen_duty_shifts(id) ON DELETE SET NULL,
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('food_ready', 'cutlery_ready', 'crockery_ready', 'equipment_ready', 'plating_complete', 'ready_for_pickup', 'custom')),
  task_description TEXT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  location_lat NUMERIC(10,8) NULL,
  location_lng NUMERIC(11,8) NULL,
  photo_url TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_staff ON kitchen_task_completions(staff_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_order ON kitchen_task_completions(order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_type ON kitchen_task_completions(task_type);
CREATE INDEX IF NOT EXISTS idx_kitchen_tasks_completed ON kitchen_task_completions(completed_at);

-- Enable RLS
ALTER TABLE kitchen_task_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kitchen_task_completions
CREATE POLICY "Staff can create their own task completions"
  ON kitchen_task_completions FOR INSERT
  WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Staff can view task completions in their company"
  ON kitchen_task_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'kitchen', 'chef')
    )
  );

CREATE POLICY "Admins can manage all task completions"
  ON kitchen_task_completions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );