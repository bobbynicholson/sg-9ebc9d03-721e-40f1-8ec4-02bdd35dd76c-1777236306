-- Client portal showed customers NO orders (my-orders, dashboard, billing,
-- tracking, quotes all blank) even though their orders existed.
--
-- Root cause: clients carry NO profiles.company_id - they belong to a
-- tenant through the `clients` table, not `profiles`. The only SELECT
-- policy on companies is:
--   company_admin_own_company USING (id = get_user_company_id(auth.uid()) ...)
-- and get_user_company_id() reads profiles.company_id, which is NULL for a
-- client. So a signed-in client cannot read their own tenant's company row,
-- AuthContext leaves `company` null, and every client-portal page gates out
-- on `company?.id` before it ever queries orders.
--
-- Fix: add a SELECT policy that lets an authenticated user read the company
-- row(s) they have a `clients` record for. Multiple SELECT policies are
-- OR'd, so this only GRANTS access - it never widens what admins/owners
-- already see, and it stays strictly tenant-scoped (a client can only read
-- the company they are actually a client of). Idempotent.

DROP POLICY IF EXISTS companies_client_read_own_tenant ON public.companies;

CREATE POLICY companies_client_read_own_tenant
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id
      FROM public.clients
      WHERE user_id = (SELECT auth.uid())
    )
  );
