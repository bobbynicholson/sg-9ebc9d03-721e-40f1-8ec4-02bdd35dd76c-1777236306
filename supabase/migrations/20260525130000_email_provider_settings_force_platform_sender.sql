-- LCF-N (task #236, 2026-05-25): force_platform_sender override.
--
-- Lets an operator who has a verified Resend domain temporarily route
-- mail back through the platform-shared sender (noreply@send.cateringms.com
-- with reply-to set to the tenant's from_email). Use cases:
--   1. Testing the platform-default path during onboarding while the
--      tenant's own DNS is still in place.
--   2. Soft-rolling back to the shared sender if Resend flags a
--      reputation issue on the tenant domain without nuking their DNS
--      work.
--
-- The resolver in emailService.resolveFromAddress now short-circuits
-- to the platform fallback when this flag is true, regardless of
-- whether resend_domain_verified_at is set.
ALTER TABLE public.email_provider_settings
  ADD COLUMN IF NOT EXISTS force_platform_sender BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.email_provider_settings.force_platform_sender IS
  'When true, send via the platform-shared noreply@send.cateringms.com address with reply-to set to the tenant from_email, even if the tenant Resend domain is verified. DNS work is preserved (resend_* columns untouched) so flipping back is a one-click toggle.';
