-- P1-16: exclude cancelled orders from order_ingredient_demand
--
-- order_ingredient_demand was filtered only by `o.deleted_at IS NULL`.
-- Cancelled orders (status='cancelled') were still emitting rows. The
-- downstream inventory_demand_outlook view narrows to ('confirmed',
-- 'preparing', 'ready') so the dashboard wasn't visibly affected, but
-- ANY direct consumer of order_ingredient_demand (kitchen demand
-- queries, the smart-shopping page, ad-hoc reports) was being lied to:
-- a cancelled order's ingredients showed as required.
--
-- Filter cancelled at the source view so every consumer is safe.
-- Active order states stay unchanged.

DROP VIEW IF EXISTS public.inventory_demand_outlook CASCADE;
DROP VIEW IF EXISTS public.order_ingredient_demand CASCADE;

CREATE VIEW public.order_ingredient_demand
WITH (security_invoker = on) AS
  SELECT o.id AS order_id,
      o.company_id,
      o.order_number,
      o.event_name,
      o.event_date,
      o.status AS order_status,
      o.guest_count,
      oi.id AS order_item_id,
      oi.menu_item_id,
      oi.item_name AS menu_item_name,
      oi.quantity AS portions_ordered,
      r.id AS recipe_id,
      r.base_servings AS recipe_base_servings,
      ri.inventory_item_id,
      ri.ingredient_name,
      ri.unit,
      ri.quantity AS quantity_per_base,
      round((((oi.quantity)::numeric / (NULLIF(r.base_servings, 0))::numeric) * (ri.quantity)::numeric), 3) AS quantity_required
     FROM (((public.orders o
       JOIN public.order_items oi ON ((oi.order_id = o.id)))
       JOIN public.recipes r ON ((r.menu_item_id = oi.menu_item_id)))
       JOIN public.recipe_ingredients ri ON ((ri.recipe_id = r.id)))
    WHERE ((o.deleted_at IS NULL)
       AND (ri.inventory_item_id IS NOT NULL)
       AND (o.status <> 'cancelled'::public.order_status))
  UNION ALL
   SELECT o.id AS order_id,
      o.company_id,
      o.order_number,
      o.event_name,
      o.event_date,
      o.status AS order_status,
      o.guest_count,
      oi.id AS order_item_id,
      oi.menu_item_id,
      oi.item_name AS menu_item_name,
      oi.quantity AS portions_ordered,
      NULL::uuid AS recipe_id,
      NULL::integer AS recipe_base_servings,
      mi.linked_inventory_item_id AS inventory_item_id,
      mi.item_name AS ingredient_name,
      inv.unit_of_measure AS unit,
      (1)::numeric AS quantity_per_base,
      (oi.quantity)::numeric AS quantity_required
     FROM (((public.orders o
       JOIN public.order_items oi ON ((oi.order_id = o.id)))
       JOIN public.menu_items mi ON ((mi.id = oi.menu_item_id)))
       JOIN public.inventory_items inv ON ((inv.id = mi.linked_inventory_item_id)))
    WHERE ((o.deleted_at IS NULL)
       AND (mi.is_buy_and_sell = true)
       AND (mi.linked_inventory_item_id IS NOT NULL)
       AND (o.status <> 'cancelled'::public.order_status)
       AND (NOT (EXISTS ( SELECT 1 FROM public.recipes r2 WHERE (r2.menu_item_id = mi.id)))));

CREATE VIEW public.inventory_demand_outlook
WITH (security_invoker = on) AS
   SELECT inv.company_id,
      inv.id AS inventory_item_id,
      inv.item_name,
      inv.category,
      inv.unit_of_measure,
      inv.current_stock,
      inv.minimum_stock,
      inv.reorder_quantity,
      COALESCE(sum(d.quantity_required) FILTER (WHERE ((d.event_date >= CURRENT_DATE) AND (d.event_date < (CURRENT_DATE + '7 days'::interval)) AND (d.order_status = ANY (ARRAY['confirmed'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status])))), (0)::numeric) AS demand_next_7_days,
      COALESCE(sum(d.quantity_required) FILTER (WHERE ((d.event_date >= CURRENT_DATE) AND (d.event_date < (CURRENT_DATE + '14 days'::interval)) AND (d.order_status = ANY (ARRAY['confirmed'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status])))), (0)::numeric) AS demand_next_14_days,
      COALESCE(sum(d.quantity_required) FILTER (WHERE ((d.event_date >= CURRENT_DATE) AND (d.event_date < (CURRENT_DATE + '30 days'::interval)) AND (d.order_status = ANY (ARRAY['confirmed'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status])))), (0)::numeric) AS demand_next_30_days,
      count(DISTINCT d.order_id) FILTER (WHERE ((d.event_date >= CURRENT_DATE) AND (d.event_date < (CURRENT_DATE + '14 days'::interval)) AND (d.order_status = ANY (ARRAY['confirmed'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status])))) AS upcoming_order_count,
      (inv.current_stock - COALESCE(sum(d.quantity_required) FILTER (WHERE ((d.event_date >= CURRENT_DATE) AND (d.event_date < (CURRENT_DATE + '7 days'::interval)) AND (d.order_status = ANY (ARRAY['confirmed'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status])))), (0)::numeric)) AS projected_stock_after_7_days,
      GREATEST((0)::numeric, (COALESCE(sum(d.quantity_required) FILTER (WHERE ((d.event_date >= CURRENT_DATE) AND (d.event_date < (CURRENT_DATE + '7 days'::interval)) AND (d.order_status = ANY (ARRAY['confirmed'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status])))), (0)::numeric) - inv.current_stock)) AS shortfall_next_7_days,
          CASE
              WHEN (inv.current_stock < COALESCE(sum(d.quantity_required) FILTER (WHERE ((d.event_date >= CURRENT_DATE) AND (d.event_date < (CURRENT_DATE + '7 days'::interval)) AND (d.order_status = ANY (ARRAY['confirmed'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status])))), (0)::numeric)) THEN 'shortfall'::text
              WHEN (inv.current_stock < inv.minimum_stock) THEN 'below_minimum'::text
              WHEN (inv.current_stock < COALESCE(sum(d.quantity_required) FILTER (WHERE ((d.event_date >= CURRENT_DATE) AND (d.event_date < (CURRENT_DATE + '14 days'::interval)) AND (d.order_status = ANY (ARRAY['confirmed'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status])))), (0)::numeric)) THEN 'low'::text
              ELSE 'ok'::text
          END AS status
     FROM (public.inventory_items inv
       LEFT JOIN public.order_ingredient_demand d ON ((d.inventory_item_id = inv.id)))
    WHERE (inv.deleted_at IS NULL)
    GROUP BY inv.company_id, inv.id, inv.item_name, inv.category, inv.unit_of_measure, inv.current_stock, inv.minimum_stock, inv.reorder_quantity;
