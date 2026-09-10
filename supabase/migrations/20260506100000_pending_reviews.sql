-- pending_reviews -- durable queue for the 24h post-delivery review prompt.
--
-- Background: notificationService.triggerAutomatedEmailSequence used to
-- schedule the review request via setTimeout(callback, 24h). Vercel
-- serverless functions don't survive 24 hours, so the timer never
-- fired and zero reviews were captured platform-wide. We now write a
-- pending_reviews row at delivery and a cron worker drains it once
-- due_at has passed.
--
-- Resolved-at-insert columns (client_email, client_name, client_user_id)
-- mean the cron handler doesn't have to re-resolve recipients when it
-- sends -- it just reads the row and dispatches.
--
-- The client_id FK is ON DELETE SET NULL because the audit trail
-- (which orders had a review request sent / cancelled) outlives the
-- client record. company_id and order_id cascade on delete -- if the
-- whole tenant or the order itself goes, the row is meaningless.

CREATE TABLE IF NOT EXISTS public.pending_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_user_id UUID,
  client_email TEXT,
  client_name TEXT,
  delivered_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending review per order. Idempotency at the database layer so
-- the workflow insert can do the cheap "INSERT ... ON CONFLICT DO
-- NOTHING" pattern instead of read-then-insert.
CREATE UNIQUE INDEX IF NOT EXISTS pending_reviews_order_id_key
  ON public.pending_reviews (order_id);

-- The cron handler's hot read: rows that are due and not yet sent or
-- cancelled. Partial index so it stays small even after years of
-- completed sends.
CREATE INDEX IF NOT EXISTS pending_reviews_due_unsent_idx
  ON public.pending_reviews (due_at, sent_at)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

-- RLS: tenant-scoped reads + writes. The cron handler uses the
-- service-role client which bypasses RLS, so policies only need to
-- cover operator UI access (cancel button, debug list).
ALTER TABLE public.pending_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_reviews_tenant_select ON public.pending_reviews;
CREATE POLICY pending_reviews_tenant_select
  ON public.pending_reviews FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS pending_reviews_tenant_update ON public.pending_reviews;
CREATE POLICY pending_reviews_tenant_update
  ON public.pending_reviews FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );
