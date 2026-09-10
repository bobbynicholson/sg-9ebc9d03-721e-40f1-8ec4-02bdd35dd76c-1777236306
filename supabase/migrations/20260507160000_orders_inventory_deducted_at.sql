-- P1-14: orders.inventory_deducted_at idempotency anchor
--
-- inventoryDeductionService.deductInventoryForOrder used to run every
-- time it was called. A duplicate trigger (status restamp, retry, two
-- workers racing) would deduct the same ingredients twice, leaving
-- inventory undercounted. The audit (Phase 2C item 8) and Phase 1 P0-15
-- both flagged the missing idempotency anchor.
--
-- Add a nullable timestamp column. The service sets it once on the
-- successful deduction; on subsequent calls the service short-circuits
-- when the column is non-null. Atomic rollback (recalculateInventoryFor
-- Order) clears it before re-running.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_deducted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.orders.inventory_deducted_at IS
  'Set once when deductInventoryForOrder successfully writes the inventory_transactions rows. Idempotency guard: a non-null value means deduction is already done; the service no-ops on subsequent calls. Cleared by recalculateInventoryForOrder before re-running.';

CREATE INDEX IF NOT EXISTS idx_orders_company_inventory_pending
  ON public.orders (company_id)
  WHERE inventory_deducted_at IS NULL;
