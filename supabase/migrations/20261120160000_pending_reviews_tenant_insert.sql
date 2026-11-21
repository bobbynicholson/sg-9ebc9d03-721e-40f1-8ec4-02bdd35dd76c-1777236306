-- Allow an authenticated tenant operator to queue an order's review prompt.
-- The order/company pair is checked together so a caller cannot attach a
-- review row to another tenant's order. Service-role cron/API paths continue
-- to bypass RLS as before.

DROP POLICY IF EXISTS pending_reviews_tenant_insert ON public.pending_reviews;
CREATE POLICY pending_reviews_tenant_insert
  ON public.pending_reviews FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = pending_reviews.order_id
        AND o.company_id = pending_reviews.company_id
        AND o.deleted_at IS NULL
    )
  );
