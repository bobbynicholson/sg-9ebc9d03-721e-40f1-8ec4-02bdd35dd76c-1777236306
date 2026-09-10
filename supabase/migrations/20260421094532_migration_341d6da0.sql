-- Step 1: Create companies table first (profiles depends on it)
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  legal_name TEXT,
  registration_number TEXT,
  tax_number TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'South Africa',
  headquarters_lat DECIMAL(10, 8),
  headquarters_lng DECIMAL(11, 8),
  subscription_tier TEXT DEFAULT 'trial',
  subscription_status subscription_status DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  subscription_starts_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  billing_currency TEXT DEFAULT 'ZAR',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#10B981',
  custom_domain TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(subscription_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_active ON public.companies(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_trial_expiry ON public.companies(trial_ends_at) WHERE subscription_status = 'trial';