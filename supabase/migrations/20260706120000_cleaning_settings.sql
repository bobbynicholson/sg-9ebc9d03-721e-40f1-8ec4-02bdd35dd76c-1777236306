-- Cleaning portal settings: a per-company JSON blob so the cleaning
-- settings page persists company-wide (was localStorage-only, per-device,
-- and read by nothing). Mirrors the existing companies.cleaning_checklist_template
-- pattern. Nullable + defaulted so existing rows and the app's DEFAULTS agree.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cleaning_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.companies.cleaning_settings IS
  'Cleaning portal defaults (photo gates, damage billing, schedule time, low-stock notify). Written by /team-portal/cleaning/settings.';
