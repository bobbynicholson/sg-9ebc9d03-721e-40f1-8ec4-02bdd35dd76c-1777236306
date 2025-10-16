-- Add active_role field to profiles table for tracking current active role
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS active_role text DEFAULT 'client';

-- Add constraint to ensure active_role is valid
ALTER TABLE profiles 
ADD CONSTRAINT profiles_active_role_check 
CHECK (active_role IN ('admin', 'driver', 'client', 'cleaning', 'shopping', 'kitchen', 'owner', 'super_admin', 'shopping_staff', 'cleaning_staff', 'kitchen_staff'));