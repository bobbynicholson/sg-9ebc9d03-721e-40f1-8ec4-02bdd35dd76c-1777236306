-- Keep malformed or unlinked PayFast history visible without letting those
-- rows pin the history cursor and block unrelated payments from reconciling.
CREATE TABLE IF NOT EXISTS public.payfast_recovery_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  source_id uuid NOT NULL,
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_transaction_id text NOT NULL,
  transaction_payload jsonb NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payfast_recovery_exceptions_pending_idx
  ON public.payfast_recovery_exceptions (source_id, first_seen_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS payfast_recovery_exceptions_company_idx
  ON public.payfast_recovery_exceptions (company_id, status, first_seen_at DESC);

ALTER TABLE public.payfast_recovery_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payfast_recovery_exceptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payfast_recovery_exceptions TO service_role;

COMMENT ON TABLE public.payfast_recovery_exceptions IS
  'PayFast history rows that cannot be safely matched to a saved checkout. They are retried when possible and retained for manual review; they never settle money by inference.';

NOTIFY pgrst, 'reload schema';
