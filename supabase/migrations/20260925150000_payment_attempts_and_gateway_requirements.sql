-- Unified external payment attempts. A checkout can exist before a gateway
-- webhook arrives, so it must not be represented only by a completed ledger
-- row. This table is the reconciliation source for pending provider sessions.
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('payfast', 'yoco', 'stripe')),
  provider_session_id TEXT NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'invoice',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'expired')),
  failure_reason TEXT,
  provider_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  succeeded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_session_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_pending
  ON public.payment_attempts(provider, status, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payment_attempts_invoice
  ON public.payment_attempts(invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order
  ON public.payment_attempts(order_id, created_at DESC);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_attempts_company_read ON public.payment_attempts;
CREATE POLICY payment_attempts_company_read ON public.payment_attempts
  FOR SELECT USING (
    company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payment_failed';

-- Only server-side service-role code inserts and transitions attempts. The
-- provider secrets are never exposed to tenant browser sessions.
