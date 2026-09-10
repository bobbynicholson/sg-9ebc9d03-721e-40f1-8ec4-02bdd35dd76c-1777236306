-- Capture the LIVE payment-gateway schema in the repo.
--
-- The modern payment_gateways shape (provider/is_test/URL columns), the
-- payment_gateway_credentials table, the one-active-per-company partial
-- index and the credentials RLS lockdown were applied to prod out-of-band
-- and never committed as a migration. A fresh environment built from
-- migrations got the legacy gateway_name/gateway_code table and every
-- /api/payment-gateways endpoint 500'd on missing columns.
--
-- Verified against prod 2026-07-06:
--   payment_gateways cols: id, company_id, provider, is_active, is_test,
--     success_url, cancel_url, notify_url, last_verified_at, created_at,
--     updated_at, created_by_user_id, updated_by_user_id, deleted_at
--   payment_gateway_credentials cols: id, gateway_id, credentials,
--     created_at, updated_at
--   RLS probe: anon + authenticated owner both read 0 rows from
--     payment_gateway_credentials while service-role reads 1 (RLS enabled,
--     no policies = deny-all, service role bypasses).
--
-- Everything below is idempotent - running it against prod is a no-op.

-- 1. Modern columns on payment_gateways (legacy installs may still carry
--    gateway_name/gateway_code; those are left alone).
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS success_url text;
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS cancel_url text;
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS notify_url text;
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. One ACTIVE gateway per company (soft-deleted rows excluded).
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateways_one_active_per_company
  ON public.payment_gateways (company_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- One config per (company, provider) among live rows - the API upserts
-- on this pair.
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateways_company_provider_live
  ON public.payment_gateways (company_id, provider)
  WHERE deleted_at IS NULL;

-- 3. Credentials vault: one row per gateway. RLS enabled with NO
--    policies = deny-all for anon/authenticated; only the service role
--    (used by the API routes) can read or write. Raw credentials must
--    never be selectable from the browser.
CREATE TABLE IF NOT EXISTS public.payment_gateway_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL UNIQUE REFERENCES public.payment_gateways(id) ON DELETE CASCADE,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_gateway_credentials ENABLE ROW LEVEL SECURITY;

-- Deliberately NO CREATE POLICY statements for
-- payment_gateway_credentials: deny-all under RLS is the design.
