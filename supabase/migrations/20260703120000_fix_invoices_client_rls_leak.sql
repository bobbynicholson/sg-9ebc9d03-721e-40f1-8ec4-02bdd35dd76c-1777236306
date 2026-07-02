-- SECURITY (P0): a logged-in CLIENT could read EVERY invoice in the
-- caterer's tenant, not just their own.
--
-- Root cause: policy `company_access_invoices` is
--   FOR ALL TO authenticated
--   USING (company_id = get_user_company_id(auth.uid()) OR super_admin)
-- Client accounts are provisioned with profiles.company_id = the
-- caterer's company_id (role='client'), so get_user_company_id() returns
-- the caterer's company and the company-wide predicate is TRUE for every
-- invoice row. Verified live on prod 2026-07-03: a client JWT read all
-- 121 of the tenant's invoices via PostgREST (scripts/probe-rls-client-leak.mjs).
--
-- orders + clients were already narrowed by earlier Wave-45 policies on
-- prod (the client saw 0 of each), so only invoices is actually leaking.
--
-- Fix:
--   1. Rescope company_access_invoices to EXCLUDE clients from the
--      company-wide branch (staff/owner + super_admin only).
--   2. Add a client-scoped SELECT policy so a client still sees exactly
--      their own invoices. invoices has no client_email column, so we
--      resolve ownership through clients: a clients row is "theirs" when
--      clients.user_id = auth.uid() (signup-linked) OR clients.email
--      matches their profile email (orphan rows booked pre-signup) --
--      the same two linkage paths useTenantClientIds.ts uses in the app.
--
-- RLS_OPT_OUT: no CREATE TABLE here; policy-only migration.

-- 1. Company staff/owner + super_admin: full access, clients excluded.
DROP POLICY IF EXISTS company_access_invoices ON public.invoices;
CREATE POLICY company_access_invoices
  ON public.invoices
  FOR ALL
  TO authenticated
  USING (
    (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
            <> 'client'::user_role
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'super_admin'::user_role
    )
  )
  WITH CHECK (
    (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
            <> 'client'::user_role
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'super_admin'::user_role
    )
  );

-- 2. Clients: read-only, only invoices tied to their own client record(s).
DROP POLICY IF EXISTS client_read_own_invoices ON public.invoices;
CREATE POLICY client_read_own_invoices
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT c.id
      FROM public.clients c
      WHERE c.company_id = public.invoices.company_id
        AND (
          c.user_id = (SELECT auth.uid())
          OR lower(c.email) = lower(
               (SELECT p.email FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
             )
        )
    )
  );
