-- Create user_departments table for assigning users to multiple departments
CREATE TABLE IF NOT EXISTS user_departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('admin', 'kitchen', 'driver', 'cleaning', 'buyer', 'client')),
  is_primary BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, department)
);

-- Enable RLS
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view all user departments" ON user_departments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can assign departments" ON user_departments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can update departments" ON user_departments FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can remove departments" ON user_departments FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_departments_user_id ON user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_department ON user_departments(department);

-- Add helpful comment
COMMENT ON TABLE user_departments IS 'Allows users to be assigned to multiple departments/roles simultaneously';