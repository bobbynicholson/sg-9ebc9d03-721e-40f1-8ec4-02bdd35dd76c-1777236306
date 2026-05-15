-- Wave 45 perf: regions RLS init-plan rewrite + consolidate duplicates
-- company_access_regions (FOR ALL) and regions_select/insert/update/delete are
-- semantically equivalent (both OR with super_admin). Drop company_access_regions
-- to remove the multiple_permissive overlap, keep the action-specific policies
-- and rewrite auth.uid() to (SELECT auth.uid()).

DROP POLICY IF EXISTS company_access_regions ON public.regions;

DROP POLICY IF EXISTS regions_select ON public.regions;
CREATE POLICY regions_select
  ON public.regions
  FOR SELECT
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS regions_insert ON public.regions;
CREATE POLICY regions_insert
  ON public.regions
  FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS regions_update ON public.regions;
CREATE POLICY regions_update
  ON public.regions
  FOR UPDATE
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  )
  WITH CHECK (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS regions_delete ON public.regions;
CREATE POLICY regions_delete
  ON public.regions
  FOR DELETE
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  );
