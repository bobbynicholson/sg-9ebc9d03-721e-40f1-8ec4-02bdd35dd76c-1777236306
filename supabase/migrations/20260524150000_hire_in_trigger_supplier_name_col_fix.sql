-- HIR-B follow-up (2026-05-24): the inherit-defaults trigger in
-- 20260524140000_hire_in_supplier_fk_and_payable_link.sql referenced
-- suppliers.name, but the column is actually suppliers.supplier_name.
-- That meant any insert into equipment_hire_orders with a NULL
-- supplier_id would blow up with "column 'name' does not exist".
-- Rewrite the function with the correct column.

CREATE OR REPLACE FUNCTION public.equipment_hire_orders_inherit_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pref_supplier uuid;
  v_supp_name text;
  v_hire_cost numeric;
BEGIN
  IF NEW.equipment_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT preferred_hire_supplier_id, hire_in_cost
    INTO v_pref_supplier, v_hire_cost
    FROM public.equipment WHERE id = NEW.equipment_id;

  IF NEW.supplier_id IS NULL AND v_pref_supplier IS NOT NULL THEN
    NEW.supplier_id := v_pref_supplier;
    SELECT supplier_name INTO v_supp_name FROM public.suppliers WHERE id = v_pref_supplier;
    IF v_supp_name IS NOT NULL AND (NEW.supplier_name IS NULL OR NEW.supplier_name = '') THEN
      NEW.supplier_name := v_supp_name;
    END IF;
  END IF;

  IF (NEW.hire_in_cost_per_unit IS NULL OR NEW.hire_in_cost_per_unit = 0)
     AND v_hire_cost IS NOT NULL AND v_hire_cost > 0 THEN
    NEW.hire_in_cost_per_unit := v_hire_cost;
    NEW.total_cost := COALESCE(NEW.quantity, 1) * v_hire_cost;
  END IF;

  RETURN NEW;
END;
$$;
