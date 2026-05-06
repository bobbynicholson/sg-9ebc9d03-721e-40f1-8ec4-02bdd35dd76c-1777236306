-- The email_provider_settings.provider check constraint predates the
-- Resend integration. The per-tenant domain verification flow writes
-- rows with provider='resend', which the old constraint rejected with
-- email_provider_settings_provider_check. Symptom: Callum tries to add
-- spitbraaidelivery.co.za and gets "violates check constraint" instead
-- of the DNS records.
--
-- Widen the allowed set to include 'resend'. Existing values stay
-- valid. Idempotent -- safe to re-run.

ALTER TABLE public.email_provider_settings
  DROP CONSTRAINT IF EXISTS email_provider_settings_provider_check;

ALTER TABLE public.email_provider_settings
  ADD CONSTRAINT email_provider_settings_provider_check
  CHECK (provider = ANY (ARRAY[
    'resend'::text,
    'gmail_oauth'::text,
    'ms365_oauth'::text,
    'smtp'::text,
    'mailchimp'::text,
    'none'::text
  ]));
