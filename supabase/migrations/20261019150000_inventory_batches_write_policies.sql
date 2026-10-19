-- inventory_batches: let staff record and use up stock batches.
--
-- 20260425113343 enabled RLS on inventory_batches but only added a SELECT
-- policy. So every insert/update from the app was refused: receiving stock
-- (inventoryService.receiveStock - admin Receive Stock, the shopping
-- "reconcile slip" drawer, admin shopping receive) never created a batch,
-- and FIFO consumption never decremented one. Stock totals still moved
-- (inventory_items), but expiry tracking and FIFO never had any rows -
-- the live table is empty.
--
-- Add INSERT and UPDATE scoped exactly like inventory_items (any user in
-- the company, plus super_admin), which is who already adjusts stock.
-- No DELETE: batches are soft-removed via deleted_at / status.
--
-- Additive and idempotent: only creates the two missing policies.

DROP POLICY IF EXISTS "Users can insert inventory batches for their company" ON public.inventory_batches;
CREATE POLICY "Users can insert inventory batches for their company"
  ON public.inventory_batches FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );

DROP POLICY IF EXISTS "Users can update inventory batches in their company" ON public.inventory_batches;
CREATE POLICY "Users can update inventory batches in their company"
  ON public.inventory_batches FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active_role = 'super_admin')
  );
