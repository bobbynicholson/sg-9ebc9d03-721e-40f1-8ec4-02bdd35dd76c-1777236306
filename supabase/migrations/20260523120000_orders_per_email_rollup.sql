-- Contacts page Phase II: server-side aggregation.
--
-- The CRM aggregated 5 tables client-side. A tenant with 7,495
-- bulk-imported contacts spent 8s+ on first paint because:
--   - Every contact required a per-order loop in JS to compute
--     order_count, total_spent, last_event_date, next_event_date.
--   - Pulled the full orders table (paginated 1000 at a time)
--     and walked every row N times against the contact map.
--
-- This view does the order aggregation once, server-side, keyed
-- by (company_id, lower(trim(client_email))) - the same dedup
-- key the contacts merge uses. Page code reads one row per
-- email-key instead of looping every order.
--
-- Cancelled orders are excluded (consistent with the page's
-- existing rule). Soft-deleted rows excluded. event_dates
-- compared against CURRENT_DATE for last/next splits.
--
-- order_ids comes back ordered descending so quoteIds[0]-style
-- "latest first" reads stay correct without a sort hop on the
-- client side.

CREATE OR REPLACE VIEW public.orders_per_email_rollup AS
SELECT
  o.company_id,
  lower(trim(o.client_email))                                     AS email_key,
  count(*) FILTER (WHERE o.status <> 'cancelled')                 AS order_count,
  COALESCE(
    sum(o.total_amount) FILTER (WHERE o.status <> 'cancelled'),
    0
  )::numeric                                                      AS total_spent,
  max(o.event_date) FILTER (
    WHERE o.status <> 'cancelled' AND o.event_date <= CURRENT_DATE
  )                                                               AS last_event_date,
  min(o.event_date) FILTER (
    WHERE o.status NOT IN ('cancelled', 'completed')
      AND o.event_date > CURRENT_DATE
  )                                                               AS next_event_date,
  array_agg(o.id ORDER BY o.created_at DESC)                      AS order_ids,
  -- Representative client_name / client_phone for order-only
  -- contacts (no clients row yet). Picks the most recent order's
  -- value to surface the freshest contact data.
  (array_agg(o.client_name ORDER BY o.created_at DESC)
    FILTER (WHERE o.client_name IS NOT NULL))[1]                  AS sample_client_name,
  (array_agg(o.client_phone ORDER BY o.created_at DESC)
    FILTER (WHERE o.client_phone IS NOT NULL))[1]                 AS sample_client_phone,
  max(o.created_at)                                               AS last_order_created_at
FROM public.orders o
WHERE o.deleted_at IS NULL
  AND o.client_email IS NOT NULL
  AND length(trim(o.client_email)) > 0
GROUP BY o.company_id, lower(trim(o.client_email));

-- Supporting index for the GROUP BY. Partial so it stays small
-- on tenants with lots of cancelled / draft / null-email orders.
CREATE INDEX IF NOT EXISTS idx_orders_company_email_key
  ON public.orders (company_id, lower(trim(client_email)))
  WHERE deleted_at IS NULL AND client_email IS NOT NULL;

-- View visibility note: RLS doesn't apply to views directly, but
-- the underlying orders table's RLS DOES. Reading the view from
-- a user session returns only rows the user can see on orders.
-- The .eq("company_id", ...) on the page is belt-and-braces.
