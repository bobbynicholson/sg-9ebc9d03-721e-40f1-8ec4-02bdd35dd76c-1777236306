-- Company workspaces are provisioned by the CateringMS platform team.
-- Remove the legacy owner self-insert branch so the permissive policy
-- matches the current platform-managed onboarding model on its own.
BEGIN;

DROP POLICY IF EXISTS companies_owner_self_insert ON public.companies;
DROP POLICY IF EXISTS companies_platform_admin_insert ON public.companies;

CREATE POLICY companies_platform_admin_insert
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

COMMIT;
