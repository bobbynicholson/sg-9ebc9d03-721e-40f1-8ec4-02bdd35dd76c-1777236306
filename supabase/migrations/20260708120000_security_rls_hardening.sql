-- Security hardening: close two verified cross-tenant read leaks
-- (2026-07-08 multi-tenant RLS audit).
--
-- Both were confirmed empirically with the anon key against prod: an
-- UNAUTHENTICATED caller could read another tenant's data because the
-- surface bypassed RLS on the underlying tables.

-- ---------------------------------------------------------------------
-- 1. orders_per_email_rollup VIEW - HIGH (confirmed unauth PII leak)
--
-- The view (20260523120000) aggregates orders (customer email, name,
-- phone, order_count, total_spent, event dates, order_ids) grouped by
-- (company_id, email_key). It was created WITHOUT security_invoker, so
-- it runs with the owner's rights and bypasses RLS on public.orders.
-- The sibling analytics views (order_ingredient_demand,
-- inventory_demand_outlook, won_then_cancelled_quotes, driver_shifts)
-- all carry security_invoker; this one was missed.
--
-- Verified: `GET /rest/v1/orders_per_email_rollup?select=*` with only
-- the anon key returned every tenant's rows (customer email + lifetime
-- spend). security_invoker=on makes the underlying orders RLS apply to
-- the CALLER, so anon sees nothing and each authenticated user sees
-- only their own company's rows (which is what the app already filters
-- to). No app change needed - the callers pass .eq(company_id, ...)
-- already.
ALTER VIEW public.orders_per_email_rollup SET (security_invoker = on);

-- ---------------------------------------------------------------------
-- 2. supplier_price_creep_summary(p_company_id) - cross-tenant BI leak
--
-- SECURITY DEFINER, granted to `authenticated`, and it filtered by the
-- caller-supplied p_company_id with no ownership check - so any signed-
-- in user (or, as verified, even anon) could pass a competitor's
-- company_id and read their per-supplier median price-movement figures.
--
-- Fix: derive the company from the authenticated caller and ignore the
-- passed argument for scoping. The legitimate browser caller always
-- passes its own company, so results are unchanged; a caller passing a
-- foreign company_id now gets only their own data. Signature kept for
-- call-site compatibility. Function is not granted to service_role, so
-- there is no server-side auth.uid()-null path to preserve.
CREATE OR REPLACE FUNCTION public.supplier_price_creep_summary(p_company_id uuid)
RETURNS TABLE (
  supplier_id uuid,
  items_compared int,
  median_pct_change numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH caller AS (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ),
  recent AS (
    SELECT h.supplier_id, h.inventory_item_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY h.unit_price) AS price
      FROM public.inventory_item_supplier_price_history h
     WHERE h.company_id = (SELECT company_id FROM caller)
       AND h.recorded_at >= now() - interval '30 days'
     GROUP BY h.supplier_id, h.inventory_item_id
  ),
  baseline AS (
    SELECT h.supplier_id, h.inventory_item_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY h.unit_price) AS price
      FROM public.inventory_item_supplier_price_history h
     WHERE h.company_id = (SELECT company_id FROM caller)
       AND h.recorded_at < now() - interval '60 days'
       AND h.recorded_at >= now() - interval '120 days'
     GROUP BY h.supplier_id, h.inventory_item_id
  ),
  paired AS (
    SELECT r.supplier_id, r.inventory_item_id,
           ((r.price - b.price) / NULLIF(b.price, 0)) * 100.0 AS pct_change
      FROM recent r JOIN baseline b
        ON b.supplier_id = r.supplier_id
       AND b.inventory_item_id = r.inventory_item_id
     WHERE b.price > 0
  )
  SELECT supplier_id,
         COUNT(*)::int AS items_compared,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY pct_change) AS median_pct_change
    FROM paired
   GROUP BY supplier_id;
$$;
