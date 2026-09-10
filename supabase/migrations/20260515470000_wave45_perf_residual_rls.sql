-- Wave 45 perf: residual cleanup after per-table init-plan rewrites.
-- Two patterns left:
-- (1) Authenticated-only policies were attached to PUBLIC, so anon shows up in
--     multiple_permissive_policies pairs with anon-token policies. Re-attach to
--     `authenticated` only so anon never sees them in the planner.
-- (2) profiles has two UPDATE policies (users_update_own_profile + company_admin_update_staff).
--     Consolidate into one ORed policy.

-- profiles: consolidate UPDATE
DROP POLICY IF EXISTS users_update_own_profile ON public.profiles;
DROP POLICY IF EXISTS company_admin_update_staff ON public.profiles;
CREATE POLICY profiles_update
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND is_company_admin((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND is_company_admin((SELECT auth.uid()))
    )
  );

-- invoices: scope company_access_invoices to authenticated so it doesn't pair with anon token reader
DROP POLICY IF EXISTS company_access_invoices ON public.invoices;
CREATE POLICY company_access_invoices
  ON public.invoices
  FOR ALL
  TO authenticated
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

-- quotes: same — scope authenticated-only policies to TO authenticated.
DROP POLICY IF EXISTS "Users can view quotes from their company" ON public.quotes;
CREATE POLICY "Users can view quotes from their company"
  ON public.quotes
  FOR SELECT
  TO authenticated
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
  TO authenticated
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
  TO authenticated
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

DROP POLICY IF EXISTS "Users can delete quotes in their company" ON public.quotes;
CREATE POLICY "Users can delete quotes in their company"
  ON public.quotes
  FOR DELETE
  TO authenticated
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
