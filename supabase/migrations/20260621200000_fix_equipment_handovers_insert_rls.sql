-- Kitchen "Sign over to driver" failed with "new row violates row-level
-- security policy for table equipment_handovers".
--
-- Cause: the only write policy is
--   company_access_handovers  FOR ALL USING (company_id = get_user_company_id(auth.uid()))
-- For an INSERT, Postgres applies the WITH CHECK (which defaults to the
-- USING expression here). The HandoverToDriverPanel insert doesn't set
-- company_id, so the check `NULL = <your company>` is never true and the
-- insert is rejected.
--
-- Fix: make the policy validate via the ORDER's company as well, so a
-- handover row is allowed when it belongs to an order in the caller's
-- company - whether or not company_id was set on the row. Keeps tenant
-- isolation intact (you can still only touch handovers for your own
-- orders / company). Idempotent.

DROP POLICY IF EXISTS "company_access_handovers" ON public.equipment_handovers;

CREATE POLICY "company_access_handovers" ON public.equipment_handovers
  FOR ALL
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE company_id = public.get_user_company_id(auth.uid())
    )
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE company_id = public.get_user_company_id(auth.uid())
    )
  );
