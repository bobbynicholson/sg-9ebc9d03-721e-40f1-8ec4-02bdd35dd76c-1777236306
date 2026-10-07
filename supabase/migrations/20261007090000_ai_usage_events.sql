-- Live AI usage ledger for /admin/platform/tech-costs.
--
-- Every server-side AI call (chatbot, column matching, row repair,
-- receipt scans, EFT proof screening, knowledge review, embeddings,
-- blog drafts, brand palettes) writes one row with the provider, model,
-- token counts and the cost worked out from src/lib/techCosts/model.ts.
-- Rows are written by the service role only; super admins can read them.

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid,
  feature text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  cost_usd numeric(14, 8) NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  error text,
  latency_ms integer
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created
  ON public.ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_company
  ON public.ai_usage_events(company_id, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_events_super_admin_read" ON public.ai_usage_events;
CREATE POLICY "ai_usage_events_super_admin_read"
  ON public.ai_usage_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));
