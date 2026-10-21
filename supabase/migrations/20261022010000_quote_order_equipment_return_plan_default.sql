-- convert_quote_to_order inserts an entire jsonb_populate_record result.
-- Missing JSON keys become explicit NULLs, so the orders column DEFAULT
-- alone cannot protect older callers after service_sittings added this field.
-- Keep the NOT NULL/CHECK constraints and preserve any explicit valid plan.
BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_order_equipment_return_plan_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.equipment_return_plan := COALESCE(NEW.equipment_return_plan, 'final_collection');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_equipment_return_plan_default ON public.orders;
CREATE TRIGGER orders_equipment_return_plan_default
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_order_equipment_return_plan_default();

COMMIT;
