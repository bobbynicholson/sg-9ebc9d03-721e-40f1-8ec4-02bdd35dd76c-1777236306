-- Wave 45 perf: profiles RLS init-plan rewrite + consolidate SELECT policies
-- Three SELECT policies (profiles_own, profiles_same_company_staff, profiles_super_admin)
-- overlap on the same role -> multiple_permissive_policies. Consolidate into one.

DROP POLICY IF EXISTS profiles_own ON public.profiles;
DROP POLICY IF EXISTS profiles_same_company_staff ON public.profiles;
DROP POLICY IF EXISTS profiles_super_admin ON public.profiles;

CREATE POLICY profiles_select
  ON public.profiles
  FOR SELECT
  USING (
    id = (SELECT auth.uid())
    OR (company_id IS NOT NULL AND auth_user_is_company_staff(company_id))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS company_admin_create_staff ON public.profiles;
CREATE POLICY company_admin_create_staff
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id((SELECT auth.uid()))
    AND is_company_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS company_admin_update_staff ON public.profiles;
CREATE POLICY company_admin_update_staff
  ON public.profiles
  FOR UPDATE
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    AND is_company_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS users_update_own_profile ON public.profiles;
CREATE POLICY users_update_own_profile
  ON public.profiles
  FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
