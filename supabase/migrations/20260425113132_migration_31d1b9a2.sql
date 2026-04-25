-- =====================================================
-- COMPREHENSIVE SCHEMA FIX MIGRATION - Part 1
-- Add missing columns to existing tables
-- =====================================================

-- Add company_slug to companies
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS slug text;

-- Add unique constraint separately in case column already exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_slug_key'
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_slug_key UNIQUE (slug);
  END IF;
END $$;

-- Add owner_id to companies (reference to the company owner/creator)
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES profiles(id);

-- Create index for faster slug lookups
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);

-- Add missing columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS phone_number text,
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'ZAR',
ADD COLUMN IF NOT EXISTS region text;

-- Add missing columns to orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS client_name text,
ADD COLUMN IF NOT EXISTS delivery_time time without time zone,
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);

-- Create index for driver_id
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);

-- Add missing columns to quotes
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS client_name text,
ADD COLUMN IF NOT EXISTS client_email text,
ADD COLUMN IF NOT EXISTS menu_items jsonb,
ADD COLUMN IF NOT EXISTS equipment_items jsonb,
ADD COLUMN IF NOT EXISTS tax numeric(12,2) DEFAULT 0;

-- Add missing columns to notifications
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS priority text,
ADD COLUMN IF NOT EXISTS link text;