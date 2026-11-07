-- Stage 2: run only after the new application is deployed and
-- /api/cron/secure-billing-vault has completed its backfill.
-- This migration fails closed if any plaintext source value remains.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.companies WHERE payfast_subscription_token IS NOT NULL AND payfast_subscription_token <> '') THEN
    RAISE EXCEPTION 'PayFast company tokens remain; finish the secure billing vault backfill first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_billing_credentials WHERE legacy_token IS NOT NULL AND legacy_token <> '') THEN
    RAISE EXCEPTION 'Legacy PayFast vault tokens remain; finish the secure billing vault backfill first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.suppliers WHERE account_number IS NOT NULL AND account_number <> '') THEN
    RAISE EXCEPTION 'Supplier account numbers remain in the legacy column; finish the secure billing vault backfill first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_bank_details WHERE account_number IS NOT NULL AND account_number <> '') THEN
    RAISE EXCEPTION 'Plaintext supplier account numbers remain in the service-only vault; finish the secure billing vault backfill first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_gateway_credentials WHERE credentials->>'__encrypted_v1' IS NULL) THEN
    RAISE EXCEPTION 'Unencrypted payment gateway credentials remain; finish the secure billing vault backfill first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_gateway_credential_versions WHERE credentials->>'__encrypted_v1' IS NULL) THEN
    RAISE EXCEPTION 'Unencrypted checkout credentials remain; finish the secure billing vault backfill first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.integrations
    WHERE integration_type = 'whatsapp'
      AND NULLIF(settings->>'webhookVerifyToken', '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Plaintext WhatsApp verify tokens remain; finish the secure billing vault backfill first';
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_companies_payfast_token;
ALTER TABLE public.companies DROP COLUMN IF EXISTS payfast_subscription_token;
ALTER TABLE public.suppliers DROP COLUMN IF EXISTS account_number;

NOTIFY pgrst, 'reload schema';
