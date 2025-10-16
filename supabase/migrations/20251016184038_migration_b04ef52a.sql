-- Phase 1: Create the companies table (without the complex RLS policy for now)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Contact Information
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'South Africa',
  
  -- Business Settings
  logo_url TEXT,
  brand_color TEXT DEFAULT '#4F46E5',
  currency TEXT DEFAULT 'ZAR',
  timezone TEXT DEFAULT 'Africa/Johannesburg',
  
  -- Subscription Status
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled')),
  subscription_plan TEXT,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies(owner_id);

-- Simple RLS Policies for now
CREATE POLICY "Company owners can manage their company"
  ON companies
  FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "Anyone can view active companies"
  ON companies
  FOR SELECT
  USING (is_active = true);

COMMENT ON TABLE companies IS 'Catering businesses that use the CateringMS platform';
COMMENT ON COLUMN companies.slug IS 'URL-safe slug for company (e.g., cateringms.com/company-slug)';
COMMENT ON COLUMN companies.owner_id IS 'The primary admin who created the account';