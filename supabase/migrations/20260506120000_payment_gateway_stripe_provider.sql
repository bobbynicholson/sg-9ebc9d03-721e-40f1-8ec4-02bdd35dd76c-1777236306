-- Swap the Peach Payments slot for Stripe in the per-tenant payment
-- gateway picker. Tenants pick one of PayFast / Yoco / Stripe to take
-- payment from THEIR clients (the event customers). PayFast separately
-- remains the SaaS-subscription gateway used to bill tenants.
--
-- payment_gateways has 0 rows in prod when this lands so the swap is
-- safe; we still UPDATE any rogue 'peach' rows to 'stripe' before the
-- new check constraint is added so the migration is idempotent.

ALTER TABLE public.payment_gateways
  DROP CONSTRAINT IF EXISTS payment_gateways_provider_check;

UPDATE public.payment_gateways
  SET provider = 'stripe'
  WHERE provider = 'peach';

ALTER TABLE public.payment_gateways
  ADD CONSTRAINT payment_gateways_provider_check
  CHECK (provider = ANY (ARRAY['payfast'::text, 'yoco'::text, 'stripe'::text]));
