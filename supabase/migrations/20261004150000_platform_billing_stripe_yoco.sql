-- Platform plan billing through Stripe (auto-charging subscription) and
-- Yoco (prepaid periods with automatic renewal checkouts, because Yoco's
-- Checkout API cannot store or re-charge a card).
--
-- 1. platform_subscription_checkouts tracks every Stripe/Yoco plan checkout
--    from creation to a provider-verified outcome. The return page and the
--    webhooks both resolve the purchase from this row, so a closed browser,
--    a late webhook or a replayed callback can never grant access twice or
--    for the wrong amount.
-- 2. subscription_webhook_events accepts 'yoco'.
-- 3. subscriptions.payment_provider records which provider renews a plan,
--    and stripe_subscription_id becomes unique so Stripe events can upsert.

CREATE TABLE IF NOT EXISTS public.platform_subscription_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('stripe', 'yoco')),
  provider_session_id text,
  provider_payment_id text,
  plan_id text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'expired')),
  provider_status text,
  failure_reason text,
  -- Yoco: the paid period is fixed once, before any write that grants it,
  -- so a retried webhook extends access exactly once.
  period_start timestamptz,
  period_end timestamptz,
  subscription_id uuid,
  last_checked_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscription_checkouts_session_key
  ON public.platform_subscription_checkouts(provider, provider_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS platform_subscription_checkouts_payment_key
  ON public.platform_subscription_checkouts(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_platform_subscription_checkouts_company
  ON public.platform_subscription_checkouts(company_id, created_at DESC);

-- Service-role only. Tenants read their checkout state through the
-- authenticated /api/subscription/checkout-status route.
ALTER TABLE public.platform_subscription_checkouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_subscription_checkouts_super_admin_read" ON public.platform_subscription_checkouts;
CREATE POLICY "platform_subscription_checkouts_super_admin_read"
  ON public.platform_subscription_checkouts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

ALTER TABLE public.subscription_webhook_events
  DROP CONSTRAINT IF EXISTS subscription_webhook_events_provider_check;
ALTER TABLE public.subscription_webhook_events
  ADD CONSTRAINT subscription_webhook_events_provider_check
  CHECK (provider IN ('stripe', 'payfast', 'yoco'));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider text;

-- NULLs stay distinct, so PayFast/Yoco rows without a Stripe id coexist.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_key
  ON public.subscriptions(stripe_subscription_id);

COMMENT ON TABLE public.platform_subscription_checkouts IS
  'Stripe/Yoco platform plan checkouts. Only a verified provider webhook or provider API lookup may move a row to succeeded.';
COMMENT ON COLUMN public.subscriptions.payment_provider IS
  'payfast | stripe | yoco - which provider renews this plan. Yoco plans are prepaid periods renewed through emailed checkouts.';
