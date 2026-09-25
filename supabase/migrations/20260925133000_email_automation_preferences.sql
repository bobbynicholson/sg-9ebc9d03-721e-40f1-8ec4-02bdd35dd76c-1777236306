-- Store company-level automatic email choices as one extensible JSON object.
-- New tenants default to all supported categories enabled in the UI; existing
-- rows are merged with the same defaults when loaded by the settings page.
ALTER TABLE public.email_provider_settings
  ADD COLUMN IF NOT EXISTS automation_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.email_provider_settings.automation_preferences IS
  'Company-level automatic email category preferences. Missing keys default to enabled.';
