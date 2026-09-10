-- Atomic inventory stock decrement (fixes a lost-update race).
--
-- inventoryDeductionService deducts per-ingredient with a read-modify-
-- write: newStock = current_stock (from an earlier SELECT) - amount, then
-- an absolute UPDATE. The order-level claim only stops the SAME order
-- double-deducting; two DIFFERENT orders delivered in the same instant
-- both read stock=10 and one write is lost. Shared ingredients (used by
-- most recipes) silently over-report -> wrong COGS + reorder thresholds.
--
-- This SECURITY DEFINER function does the decrement under a row lock
-- (SELECT ... FOR UPDATE), so concurrent callers serialise and no update
-- is lost. Returns old/new/deducted so the caller can still write the
-- usage transaction (deducted) and low-stock alert (new_stock).
--
-- RLS_OPT_OUT: function only; no CREATE TABLE.

CREATE OR REPLACE FUNCTION public.deduct_inventory_stock(
  p_item_id uuid,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_stock numeric;
  new_stock numeric;
BEGIN
  SELECT current_stock INTO old_stock
  FROM public.inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF old_stock IS NULL THEN
    RETURN NULL; -- item not found; caller keeps its "not found" warning path
  END IF;

  -- Deduct up to the requested amount, never below zero (mirrors the
  -- old min(current_stock, needed) clamp, now atomic).
  new_stock := GREATEST(0, old_stock - GREATEST(0, p_amount));

  UPDATE public.inventory_items
  SET current_stock = new_stock
  WHERE id = p_item_id;

  RETURN json_build_object(
    'old_stock', old_stock,
    'new_stock', new_stock,
    'deducted', old_stock - new_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_stock(uuid, numeric) TO authenticated, service_role;
