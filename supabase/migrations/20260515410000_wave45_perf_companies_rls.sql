-- Wave 45 perf: companies RLS init-plan rewrite + consolidate duplicates
-- super_admin_all_companies (FOR ALL) overlaps with every other policy. Drop it
-- and OR is_super_admin() into each action-specific policy.

DROP POLICY IF EXISTS super_admin_all_companies ON public.companies;

-- INSERT (existing already ORs is_super_admin)
DROP POLICY IF EXISTS companies_owner_self_insert ON public.companies;
CREATE POLICY companies_owner_self_insert
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    OR is_super_admin()
  );

-- SELECT
DROP POLICY IF EXISTS company_admin_own_company ON public.companies;
CREATE POLICY company_admin_own_company
  ON public.companies
  FOR SELECT
  USING (
    id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  );

-- UPDATE
DROP POLICY IF EXISTS company_admin_update_own ON public.companies;
CREATE POLICY company_admin_update_own
  ON public.companies
  FOR UPDATE
  USING (
    (id = get_user_company_id((SELECT auth.uid())) AND is_company_admin((SELECT auth.uid())))
    OR is_super_admin()
  );

-- DELETE — preserve super_admin-only delete (no prior policy existed beyond FOR ALL super_admin)
CREATE POLICY companies_super_admin_delete
  ON public.companies
  FOR DELETE
  USING (is_super_admin());
