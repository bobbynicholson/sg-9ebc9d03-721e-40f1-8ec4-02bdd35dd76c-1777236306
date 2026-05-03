-- Onboarding completion state on companies.
--
-- Most onboarding step state is *derived* from real signals (clients,
-- orders, menu_items, inventory_items, equipment, profiles, kitchen
-- staff). We don't persist per-step booleans -- they'd drift from reality.
--
-- We do persist two timestamps:
--   onboarding_completed_at -- set when the owner clicks "we're done", or
--                              auto-set when every required step satisfies
--                              its real-signal check. Drives the
--                              login-time auto-redirect to /admin/onboarding.
--   onboarding_dismissed_at -- soft-dismiss so the day-zero "First Steps"
--                              card on the dashboard can be hidden without
--                              the owner having to mark onboarding fully
--                              done.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS onboarding_completed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at  timestamptz;

COMMENT ON COLUMN public.companies.onboarding_completed_at IS
  'Timestamp the owner finished onboarding (manual confirm or all required signals satisfied). NULL = still in onboarding -- middleware can route them back to /admin/onboarding on login.';
COMMENT ON COLUMN public.companies.onboarding_dismissed_at IS
  'Soft-dismiss for the day-zero First Steps dashboard card. Hides the helper UI without marking onboarding fully complete.';
