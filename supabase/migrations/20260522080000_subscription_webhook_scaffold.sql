-- Subscription webhook scaffold (docs/pricing-model.md gate 1).
--
-- Adds the minimum schema needed for the platform-level Stripe +
-- PayFast subscription webhooks to land safely:
--
--   1. subscription_webhook_events - idempotency log so a re-delivered
--      Stripe / PayFast event doesn't double-credit the tenant.
--   2. companies.stripe_customer_id - the platform Stripe customer
--      record that subscription events reference. Mirrors the per-tenant
--      subscriptions table column but on companies so the webhook can
--      look up the company from the event payload without joining.
--   3. companies.payfast_subscription_token - PayFast's billing token,
--      same purpose.
--
-- The actual webhook handlers (/api/webhooks/subscriptions/stripe.ts
-- and /api/webhooks/subscriptions/payfast.ts) are env-driven no-ops
-- until STRIPE_SUBSCRIPTION_WEBHOOK_SECRET / PAYFAST_PASSPHRASE are
-- configured. Safe to apply on every environment.

CREATE TABLE IF NOT EXISTS public.subscription_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('stripe', 'payfast')),
  -- Stripe `evt_...` id; PayFast pf_payment_id or m_payment_id.
  event_id text NOT NULL,
  event_type text NOT NULL,
  -- Snapshot of the raw payload for after-the-fact debugging.
  raw jsonb NOT NULL,
  -- Idempotency: which company was affected, if known. Useful for
  -- audit trail; NULL when the event arrived before we could resolve
  -- a tenant (rare, but Stripe's customer.created can fire before our
  -- own internal record exists).
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  -- Non-null on rejections so the operator can see why an event was
  -- skipped (signature failure, unknown company, no-op event type).
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_webhook_events_provider_event_id_unique
    UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_webhook_events_company
  ON public.subscription_webhook_events(company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_webhook_events_provider_event
  ON public.subscription_webhook_events(provider, event_type, created_at DESC);

-- RLS: super_admin only. Tenants don't read their own webhook log
-- (it's platform-level audit data, not a customer-facing surface).
ALTER TABLE public.subscription_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_webhook_events_super_admin_read"
  ON public.subscription_webhook_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- No INSERT policy: writes only via service-role (the webhook handler
-- uses getServiceSupabase, which bypasses RLS).

-- Companies columns. IF NOT EXISTS so re-running the migration on a
-- branch that already has them is a no-op.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS payfast_subscription_token text;

CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer
  ON public.companies(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_payfast_token
  ON public.companies(payfast_subscription_token)
  WHERE payfast_subscription_token IS NOT NULL;

COMMENT ON COLUMN public.companies.stripe_customer_id IS
  'Platform Stripe customer id (cus_...) for SaaS subscription billing. Set when the company starts a subscription via Stripe Checkout. Read by /api/webhooks/subscriptions/stripe to map events back to companies.';

COMMENT ON COLUMN public.companies.payfast_subscription_token IS
  'PayFast subscription token returned from a successful PayFast subscription create. Read by /api/webhooks/subscriptions/payfast to map ITN events back to companies.';
