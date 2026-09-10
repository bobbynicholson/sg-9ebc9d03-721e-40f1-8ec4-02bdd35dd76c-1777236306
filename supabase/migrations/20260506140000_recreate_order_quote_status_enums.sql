-- Phase 4B: recreate order_status and quote_status enums without their
-- deprecated values.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so the only way to remove
-- a label is to recreate the type, repoint every dependent column, and
-- drop the old type.
--
-- Pre-flight (run via Supabase MCP before applying):
--   SELECT status, COUNT(*) FROM orders WHERE status::text IN ('prep','out_for_delivery') GROUP BY 1;
--   SELECT status, COUNT(*) FROM quotes WHERE status::text IN ('viewed','revised','pending') GROUP BY 1;
--
-- At apply time:
--   * orders had 1 row on 'out_for_delivery' -- normalised to 'in_transit'.
--   * orders had 0 rows on 'prep'.
--   * quotes had 0 rows on viewed / revised / pending.
--   * orders.paused_from_status was empty.
--
-- Dependents handled here (every object that pinned the old enum type
-- or the orders.status column had to be dropped before the swap):
--   * View public.order_ingredient_demand (reads orders.status).
--   * View public.inventory_demand_outlook (reads order_ingredient_demand).
--   * Triggers on orders that fire AFTER UPDATE OF status:
--       orders_dispatch_status, orders_email_on_status,
--       trg_auto_invoice_on_order_completion, trg_sync_vehicle_booking_status,
--       trigger_notify_driver_order_ready, trigger_send_order_status_email.
--   * Triggers on quotes that fire on status (or whose WHEN clause
--     references quote_status):
--       quotes_dispatch_status, quotes_email_on_insert,
--       quotes_email_on_sent, trg_quote_accepted_spawn_hire_orders.
--   * Column orders.paused_from_status (also order_status-typed).
--
-- order_status final values: pending, confirmed, preparing, ready,
-- in_transit, delivered, completed, cancelled, paused.
-- quote_status final values: draft, sent, accepted, rejected, expired.

BEGIN;

-- ---------------------------------------------------------------------
-- Pre-flight normalisation. Safe to re-run; no-ops on already-clean data.
-- ---------------------------------------------------------------------
UPDATE public.orders SET status = 'in_transit' WHERE status::text = 'out_for_delivery';
UPDATE public.orders SET status = 'preparing'  WHERE status::text = 'prep';

UPDATE public.quotes SET status = 'sent'  WHERE status::text = 'viewed';
UPDATE public.quotes SET status = 'draft' WHERE status::text = 'revised';
UPDATE public.quotes SET status = 'draft' WHERE status::text = 'pending';

-- ---------------------------------------------------------------------
-- Drop dependents that pin the old enum types or the swapped columns.
-- ---------------------------------------------------------------------

-- Views (cascade chain: orders.status -> order_ingredient_demand -> inventory_demand_outlook)
DROP VIEW IF EXISTS public.inventory_demand_outlook;
DROP VIEW IF EXISTS public.order_ingredient_demand;

-- Triggers pinned to orders.status
DROP TRIGGER IF EXISTS orders_dispatch_status ON public.orders;
DROP TRIGGER IF EXISTS orders_email_on_status ON public.orders;
DROP TRIGGER IF EXISTS trg_auto_invoice_on_order_completion ON public.orders;
DROP TRIGGER IF EXISTS trg_sync_vehicle_booking_status ON public.orders;
DROP TRIGGER IF EXISTS trigger_notify_driver_order_ready ON public.orders;
DROP TRIGGER IF EXISTS trigger_send_order_status_email ON public.orders;

-- Triggers pinned to quotes.status (or whose WHEN references quote_status)
DROP TRIGGER IF EXISTS quotes_dispatch_status ON public.quotes;
DROP TRIGGER IF EXISTS quotes_email_on_insert ON public.quotes;
DROP TRIGGER IF EXISTS quotes_email_on_sent ON public.quotes;
DROP TRIGGER IF EXISTS trg_quote_accepted_spawn_hire_orders ON public.quotes;

-- ---------------------------------------------------------------------
-- order_status -- recreate via ADD/UPDATE/DROP/RENAME pattern.
-- Both orders.status and orders.paused_from_status are enum-typed.
-- ---------------------------------------------------------------------

CREATE TYPE public.order_status_new AS ENUM (
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'in_transit',
  'delivered',
  'completed',
  'cancelled',
  'paused'
);

ALTER TABLE public.orders ADD COLUMN status_new public.order_status_new;
UPDATE public.orders SET status_new = status::text::public.order_status_new;
ALTER TABLE public.orders ALTER COLUMN status_new SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN status_new SET DEFAULT 'pending'::public.order_status_new;

ALTER TABLE public.orders ADD COLUMN paused_from_status_new public.order_status_new;
UPDATE public.orders SET paused_from_status_new = paused_from_status::text::public.order_status_new
 WHERE paused_from_status IS NOT NULL;

ALTER TABLE public.orders DROP COLUMN status;
ALTER TABLE public.orders RENAME COLUMN status_new TO status;
ALTER TABLE public.orders DROP COLUMN paused_from_status;
ALTER TABLE public.orders RENAME COLUMN paused_from_status_new TO paused_from_status;

DROP TYPE public.order_status;
ALTER TYPE public.order_status_new RENAME TO order_status;

COMMENT ON TYPE public.order_status IS
  'Order lifecycle status. Values: pending, confirmed, preparing, ready, in_transit, delivered, completed, cancelled, paused. Cleaned up in Phase 4B (dropped legacy prep + out_for_delivery).';

-- ---------------------------------------------------------------------
-- quote_status -- same recreate pattern.
-- ---------------------------------------------------------------------

CREATE TYPE public.quote_status_new AS ENUM (
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired'
);

ALTER TABLE public.quotes ADD COLUMN status_new public.quote_status_new;
UPDATE public.quotes SET status_new = status::text::public.quote_status_new;
ALTER TABLE public.quotes ALTER COLUMN status_new SET NOT NULL;
ALTER TABLE public.quotes ALTER COLUMN status_new SET DEFAULT 'draft'::public.quote_status_new;
ALTER TABLE public.quotes DROP COLUMN status;
ALTER TABLE public.quotes RENAME COLUMN status_new TO status;
DROP TYPE public.quote_status;
ALTER TYPE public.quote_status_new RENAME TO quote_status;

COMMENT ON TYPE public.quote_status IS
  'Quote lifecycle status. Values: draft, sent, accepted, rejected, expired. Cleaned up in Phase 4B (dropped legacy viewed, revised, pending).';

-- ---------------------------------------------------------------------
-- Recreate dependent views.
-- ---------------------------------------------------------------------

CREATE VIEW public.order_ingredient_demand AS
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
    round(oi.quantity::numeric / NULLIF(r.base_servings, 0)::numeric * ri.quantity::numeric, 3) AS quantity_required
   FROM public.orders o
     JOIN public.order_items oi ON oi.order_id = o.id
     JOIN public.recipes r ON r.menu_item_id = oi.menu_item_id
     JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
  WHERE o.deleted_at IS NULL AND ri.inventory_item_id IS NOT NULL
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
    1::numeric AS quantity_per_base,
    oi.quantity::numeric AS quantity_required
   FROM public.orders o
     JOIN public.order_items oi ON oi.order_id = o.id
     JOIN public.menu_items mi ON mi.id = oi.menu_item_id
     JOIN public.inventory_items inv ON inv.id = mi.linked_inventory_item_id
  WHERE o.deleted_at IS NULL
    AND mi.is_buy_and_sell = true
    AND mi.linked_inventory_item_id IS NOT NULL
    AND NOT (EXISTS (SELECT 1 FROM public.recipes r2 WHERE r2.menu_item_id = mi.id));

CREATE VIEW public.inventory_demand_outlook AS
 SELECT inv.company_id,
    inv.id AS inventory_item_id,
    inv.item_name,
    inv.category,
    inv.unit_of_measure,
    inv.current_stock,
    inv.minimum_stock,
    inv.reorder_quantity,
    COALESCE(sum(d.quantity_required) FILTER (WHERE d.event_date >= CURRENT_DATE AND d.event_date < (CURRENT_DATE + '7 days'::interval) AND (d.order_status = ANY (ARRAY['confirmed'::order_status, 'preparing'::order_status, 'ready'::order_status]))), 0::numeric) AS demand_next_7_days,
    COALESCE(sum(d.quantity_required) FILTER (WHERE d.event_date >= CURRENT_DATE AND d.event_date < (CURRENT_DATE + '14 days'::interval) AND (d.order_status = ANY (ARRAY['confirmed'::order_status, 'preparing'::order_status, 'ready'::order_status]))), 0::numeric) AS demand_next_14_days,
    COALESCE(sum(d.quantity_required) FILTER (WHERE d.event_date >= CURRENT_DATE AND d.event_date < (CURRENT_DATE + '30 days'::interval) AND (d.order_status = ANY (ARRAY['confirmed'::order_status, 'preparing'::order_status, 'ready'::order_status]))), 0::numeric) AS demand_next_30_days,
    count(DISTINCT d.order_id) FILTER (WHERE d.event_date >= CURRENT_DATE AND d.event_date < (CURRENT_DATE + '14 days'::interval) AND (d.order_status = ANY (ARRAY['confirmed'::order_status, 'preparing'::order_status, 'ready'::order_status]))) AS upcoming_order_count,
    inv.current_stock - COALESCE(sum(d.quantity_required) FILTER (WHERE d.event_date >= CURRENT_DATE AND d.event_date < (CURRENT_DATE + '7 days'::interval) AND (d.order_status = ANY (ARRAY['confirmed'::order_status, 'preparing'::order_status, 'ready'::order_status]))), 0::numeric) AS projected_stock_after_7_days,
    GREATEST(0::numeric, COALESCE(sum(d.quantity_required) FILTER (WHERE d.event_date >= CURRENT_DATE AND d.event_date < (CURRENT_DATE + '7 days'::interval) AND (d.order_status = ANY (ARRAY['confirmed'::order_status, 'preparing'::order_status, 'ready'::order_status]))), 0::numeric) - inv.current_stock) AS shortfall_next_7_days,
    CASE
        WHEN inv.current_stock < COALESCE(sum(d.quantity_required) FILTER (WHERE d.event_date >= CURRENT_DATE AND d.event_date < (CURRENT_DATE + '7 days'::interval) AND (d.order_status = ANY (ARRAY['confirmed'::order_status, 'preparing'::order_status, 'ready'::order_status]))), 0::numeric) THEN 'shortfall'::text
        WHEN inv.current_stock < inv.minimum_stock THEN 'below_minimum'::text
        WHEN inv.current_stock < COALESCE(sum(d.quantity_required) FILTER (WHERE d.event_date >= CURRENT_DATE AND d.event_date < (CURRENT_DATE + '14 days'::interval) AND (d.order_status = ANY (ARRAY['confirmed'::order_status, 'preparing'::order_status, 'ready'::order_status]))), 0::numeric) THEN 'low'::text
        ELSE 'ok'::text
    END AS status
   FROM public.inventory_items inv
     LEFT JOIN public.order_ingredient_demand d ON d.inventory_item_id = inv.id
  WHERE inv.deleted_at IS NULL
  GROUP BY inv.company_id, inv.id, inv.item_name, inv.category, inv.unit_of_measure, inv.current_stock, inv.minimum_stock, inv.reorder_quantity;

-- ---------------------------------------------------------------------
-- Recreate triggers.
-- ---------------------------------------------------------------------

CREATE TRIGGER orders_dispatch_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_order_status_changed();

CREATE TRIGGER orders_email_on_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_order_email();

CREATE TRIGGER trg_auto_invoice_on_order_completion
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.auto_create_invoice_on_completion();

CREATE TRIGGER trg_sync_vehicle_booking_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN ((old.status IS DISTINCT FROM new.status))
EXECUTE FUNCTION public.sync_vehicle_booking_status();

CREATE TRIGGER trigger_notify_driver_order_ready
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_driver_order_ready();

CREATE TRIGGER trigger_send_order_status_email
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.send_order_status_email();

CREATE TRIGGER quotes_dispatch_status
AFTER UPDATE OF status ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.trg_quote_sent();

CREATE TRIGGER quotes_email_on_insert
AFTER INSERT ON public.quotes
FOR EACH ROW
WHEN ((new.status = 'sent'::public.quote_status))
EXECUTE FUNCTION public.trg_quote_sent_email();

CREATE TRIGGER quotes_email_on_sent
AFTER UPDATE OF status ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.trg_quote_sent_email();

CREATE TRIGGER trg_quote_accepted_spawn_hire_orders
AFTER UPDATE OF status ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.tg_quote_accepted_spawn_hire_orders();

COMMIT;
