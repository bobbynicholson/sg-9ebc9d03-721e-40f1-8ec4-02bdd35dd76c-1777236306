-- Wave 45 perf: invoices RLS init-plan rewrite

DROP POLICY IF EXISTS company_access_invoices ON public.invoices;
CREATE POLICY company_access_invoices
  ON public.invoices
  FOR ALL
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'::user_role
    )
  )
  WITH CHECK (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'::user_role
    )
  );

-- anon_read_invoice_by_token uses no auth.uid(); leave untouched.
