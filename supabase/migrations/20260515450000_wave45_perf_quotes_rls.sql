-- Wave 45 perf: quotes RLS init-plan rewrite
-- Preserve legacy "Users can ..." policies and the anon token reader. region_scope_*
-- are RESTRICTIVE (no auth.uid() inside). Just rewrite auth.uid() to (SELECT auth.uid()).

DROP POLICY IF EXISTS "Users can delete quotes in their company" ON public.quotes;
CREATE POLICY "Users can delete quotes in their company"
  ON public.quotes
  FOR DELETE
  USING (
    company_id IN (
      SELECT profiles.company_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.active_role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Users can insert quotes for their company" ON public.quotes;
CREATE POLICY "Users can insert quotes for their company"
  ON public.quotes
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT profiles.company_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.active_role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Users can update quotes in their company" ON public.quotes;
CREATE POLICY "Users can update quotes in their company"
  ON public.quotes
  FOR UPDATE
  USING (
    company_id IN (
      SELECT profiles.company_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.active_role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Users can view quotes from their company" ON public.quotes;
CREATE POLICY "Users can view quotes from their company"
  ON public.quotes
  FOR SELECT
  USING (
    company_id IN (
      SELECT profiles.company_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.active_role = 'super_admin'
    )
  );

-- anon_read_quote_by_token has no auth.uid() in qual, leave untouched.
-- region_scope_quotes_* are RESTRICTIVE with only user_can_access_region(); leave.
