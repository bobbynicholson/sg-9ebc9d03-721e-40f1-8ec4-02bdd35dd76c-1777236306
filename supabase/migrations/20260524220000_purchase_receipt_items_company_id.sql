-- TAX-C (task #180, 2026-05-24): backfill company_id on
-- purchase_receipt_items so the realtime subscriptions on
-- /admin/tax-purchases and /admin/shopping Receipts tab can
-- finally tenant-filter.
--
-- The two pages currently subscribe to either (a) every tenant's
-- inserts then re-fetch (audit-noted cost: O(tenants) realtime
-- fan-out) or (b) try to filter by a column that doesn't exist
-- (PR #354's ReceiptsTab filter silently matched nothing).
--
-- Fix: copy company_id from parent purchase_receipts. Add a
-- BEFORE INSERT trigger so new rows derive it automatically.
-- Existing RLS on the table is via receipt_id join; the new
-- column just enables the realtime filter.

ALTER TABLE public.purchase_receipt_items
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill from parent. Anything orphaned (no matching receipt)
-- gets NULL - left to soft-delete cleanup.
UPDATE public.purchase_receipt_items i
SET company_id = r.company_id
FROM public.purchase_receipts r
WHERE i.receipt_id = r.id
  AND i.company_id IS NULL;

-- Trigger to auto-stamp on insert. Saves every call site from
-- needing to know about the column.
CREATE OR REPLACE FUNCTION public.purchase_receipt_items_stamp_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.receipt_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
      FROM public.purchase_receipts
      WHERE id = NEW.receipt_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_receipt_items_stamp_company_id
  ON public.purchase_receipt_items;
CREATE TRIGGER trg_purchase_receipt_items_stamp_company_id
  BEFORE INSERT ON public.purchase_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_receipt_items_stamp_company_id();

-- Realtime filter needs an index.
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_company_id
  ON public.purchase_receipt_items (company_id);

COMMENT ON COLUMN public.purchase_receipt_items.company_id IS
  'TAX-C: denormalised from parent purchase_receipts.company_id. Auto-stamped by trg_purchase_receipt_items_stamp_company_id on insert. Enables realtime tenant-filter on the table.';
