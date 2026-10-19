-- purchase_receipts / purchase_receipt_items: explicit, company-scoped RLS.
--
-- Both tables were created outside the migrations, so the repo never said
-- who may read or write them. The browser screens that do (shopping
-- "reconcile slip" drawer, restock receipts, receipts tab, admin shopping,
-- tax purchases, supplier pages) need the shopping team and the office to
-- read and write their OWN company's receipts, and nobody else to see them:
-- receipts carry supplier prices and totals.
--
-- This migration makes that true whatever the live state is:
--   * RLS on (if it was off, every signed-in user of any company - clients
--     included - could read every company's receipts);
--   * owner / company_admin / admin / region_admin / shopping_staff of the
--     row's company may read and write; sales_admin may read;
--     super_admin may do anything.
-- Existing policies are left in place (policies are OR'd, so nothing that
-- works today loses access). Server routes use the service role and are
-- unaffected. Idempotent: only drops/recreates the policies named here.

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;

-- Caller may read (p_write = false) or write (p_write = true) receipts of
-- p_company. SECURITY DEFINER so the profiles lookup isn't itself blocked
-- by profiles RLS; search_path pinned.
CREATE OR REPLACE FUNCTION public.can_access_purchase_receipts(p_company uuid, p_write boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        COALESCE(p.active_role, p.role::text) = 'super_admin'
        OR p.role::text = 'super_admin'
        OR (
          p.company_id = p_company
          AND COALESCE(p.active_role, p.role::text) = ANY (
            CASE WHEN p_write
              THEN ARRAY['owner','company_admin','admin','region_admin','shopping_staff']
              ELSE ARRAY['owner','company_admin','admin','region_admin','shopping_staff','sales_admin']
            END
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_purchase_receipts(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_purchase_receipts(uuid, boolean) TO authenticated, service_role;

-- purchase_receipts
DROP POLICY IF EXISTS "purchase_receipts_company_select" ON public.purchase_receipts;
CREATE POLICY "purchase_receipts_company_select" ON public.purchase_receipts
  FOR SELECT TO authenticated
  USING (public.can_access_purchase_receipts(company_id, false));

DROP POLICY IF EXISTS "purchase_receipts_company_insert" ON public.purchase_receipts;
CREATE POLICY "purchase_receipts_company_insert" ON public.purchase_receipts
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_purchase_receipts(company_id, true));

DROP POLICY IF EXISTS "purchase_receipts_company_update" ON public.purchase_receipts;
CREATE POLICY "purchase_receipts_company_update" ON public.purchase_receipts
  FOR UPDATE TO authenticated
  USING (public.can_access_purchase_receipts(company_id, true))
  WITH CHECK (public.can_access_purchase_receipts(company_id, true));

DROP POLICY IF EXISTS "purchase_receipts_company_delete" ON public.purchase_receipts;
CREATE POLICY "purchase_receipts_company_delete" ON public.purchase_receipts
  FOR DELETE TO authenticated
  USING (public.can_access_purchase_receipts(company_id, true));

-- purchase_receipt_items: scoped through the parent receipt's company, so
-- it holds even before the BEFORE INSERT trigger stamps company_id
-- (20260524220000) and for any legacy row with company_id still null.
DROP POLICY IF EXISTS "purchase_receipt_items_company_select" ON public.purchase_receipt_items;
CREATE POLICY "purchase_receipt_items_company_select" ON public.purchase_receipt_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_receipts r
    WHERE r.id = purchase_receipt_items.receipt_id
      AND public.can_access_purchase_receipts(r.company_id, false)
  ));

DROP POLICY IF EXISTS "purchase_receipt_items_company_insert" ON public.purchase_receipt_items;
CREATE POLICY "purchase_receipt_items_company_insert" ON public.purchase_receipt_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_receipts r
    WHERE r.id = purchase_receipt_items.receipt_id
      AND public.can_access_purchase_receipts(r.company_id, true)
  ));

DROP POLICY IF EXISTS "purchase_receipt_items_company_update" ON public.purchase_receipt_items;
CREATE POLICY "purchase_receipt_items_company_update" ON public.purchase_receipt_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_receipts r
    WHERE r.id = purchase_receipt_items.receipt_id
      AND public.can_access_purchase_receipts(r.company_id, true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_receipts r
    WHERE r.id = purchase_receipt_items.receipt_id
      AND public.can_access_purchase_receipts(r.company_id, true)
  ));

DROP POLICY IF EXISTS "purchase_receipt_items_company_delete" ON public.purchase_receipt_items;
CREATE POLICY "purchase_receipt_items_company_delete" ON public.purchase_receipt_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_receipts r
    WHERE r.id = purchase_receipt_items.receipt_id
      AND public.can_access_purchase_receipts(r.company_id, true)
  ));
