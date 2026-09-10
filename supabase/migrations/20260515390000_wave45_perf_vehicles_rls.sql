-- Wave 45 perf: vehicles RLS init-plan rewrite + consolidate duplicate policies
-- The vehicles_*_company action-specific policies are a STRICTER subset of
-- company_access_vehicles (which also allows super_admin). Since they OR together,
-- the effective access matches company_access_vehicles. Drop the duplicates and
-- split company_access_vehicles into per-action policies.

DROP POLICY IF EXISTS vehicles_delete_company ON public.vehicles;
DROP POLICY IF EXISTS vehicles_insert_company ON public.vehicles;
DROP POLICY IF EXISTS vehicles_select_company ON public.vehicles;
DROP POLICY IF EXISTS vehicles_update_company ON public.vehicles;
DROP POLICY IF EXISTS company_access_vehicles ON public.vehicles;

CREATE POLICY vehicles_select
  ON public.vehicles
  FOR SELECT
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'::user_role
    )
  );

CREATE POLICY vehicles_insert
  ON public.vehicles
  FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'::user_role
    )
  );

CREATE POLICY vehicles_update
  ON public.vehicles
  FOR UPDATE
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

CREATE POLICY vehicles_delete
  ON public.vehicles
  FOR DELETE
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'::user_role
    )
  );
