-- Add company_slug to profiles table for URL routing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_slug TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company_slug ON profiles(company_slug);

-- Add comment to explain the field
COMMENT ON COLUMN profiles.company_slug IS 'URL-friendly unique identifier for company portals (e.g., spit-braai-delivery)';