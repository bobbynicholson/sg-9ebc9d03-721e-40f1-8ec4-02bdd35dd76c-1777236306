-- Keep the procurement outlook focused on the demand it actually displays.
-- The previous view joined every historical order/recipe line and only
-- filtered dates inside aggregate expressions, which made the dashboard
-- scan an ever-growing demand history just to calculate the next 30 days.

CREATE INDEX IF NOT EXISTS idx_orders_procurement_demand
  ON public.orders (company_id, status, event_date)
  WHERE deleted_at IS NULL
    AND status IN ('confirmed', 'preparing', 'ready');

CREATE OR REPLACE VIEW public.inventory_demand_outlook
WITH (security_invoker = on) AS
WITH upcoming_demand AS (
  SELECT
    d.company_id,
    d.inventory_item_id,
    d.event_date,
    d.order_id,
    d.quantity_required
  FROM public.order_ingredient_demand d
  WHERE d.event_date >= CURRENT_DATE
    AND d.event_date < CURRENT_DATE + INTERVAL '30 days'
    AND d.order_status IN ('confirmed', 'preparing', 'ready')
), demand_by_item AS (
  SELECT
    d.company_id,
    d.inventory_item_id,
    COALESCE(SUM(d.quantity_required) FILTER (
      WHERE d.event_date < CURRENT_DATE + INTERVAL '7 days'
    ), 0::numeric) AS demand_next_7_days,
    COALESCE(SUM(d.quantity_required) FILTER (
      WHERE d.event_date < CURRENT_DATE + INTERVAL '14 days'
    ), 0::numeric) AS demand_next_14_days,
    COALESCE(SUM(d.quantity_required), 0::numeric) AS demand_next_30_days,
    COUNT(DISTINCT d.order_id) FILTER (
      WHERE d.event_date < CURRENT_DATE + INTERVAL '14 days'
    ) AS upcoming_order_count
  FROM upcoming_demand d
  GROUP BY d.company_id, d.inventory_item_id
)
SELECT
  inv.company_id,
  inv.id AS inventory_item_id,
  inv.item_name,
  inv.category,
  inv.unit_of_measure,
  inv.current_stock,
  inv.minimum_stock,
  inv.reorder_quantity,
  COALESCE(d.demand_next_7_days, 0::numeric) AS demand_next_7_days,
  COALESCE(d.demand_next_14_days, 0::numeric) AS demand_next_14_days,
  COALESCE(d.demand_next_30_days, 0::numeric) AS demand_next_30_days,
  COALESCE(d.upcoming_order_count, 0::bigint) AS upcoming_order_count,
  inv.current_stock - COALESCE(d.demand_next_7_days, 0::numeric)
    AS projected_stock_after_7_days,
  GREATEST(0::numeric, COALESCE(d.demand_next_7_days, 0::numeric) - inv.current_stock)
    AS shortfall_next_7_days,
  CASE
    WHEN inv.current_stock < COALESCE(d.demand_next_7_days, 0::numeric) THEN 'shortfall'::text
    WHEN inv.current_stock < inv.minimum_stock THEN 'below_minimum'::text
    WHEN inv.current_stock < COALESCE(d.demand_next_14_days, 0::numeric) THEN 'low'::text
    ELSE 'ok'::text
  END AS status
FROM public.inventory_items inv
LEFT JOIN demand_by_item d
  ON d.company_id = inv.company_id
  AND d.inventory_item_id = inv.id
WHERE inv.deleted_at IS NULL;

GRANT SELECT ON public.inventory_demand_outlook TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
