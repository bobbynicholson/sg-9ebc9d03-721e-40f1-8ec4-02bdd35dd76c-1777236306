-- Fix: saving a scanned or hand-entered slip's lines always failed with
-- "Related record must belong to the same company".
--
-- 20261029150000_company_relationship_integrity added BEFORE INSERT triggers
-- company_fk_receipt_id / company_fk_inventory_item_id on
-- purchase_receipt_items. They compare the line's company_id with the
-- parent's. The line's company_id is filled in by
-- trg_purchase_receipt_items_stamp_company_id (20260524220000), but Postgres
-- fires same-timing triggers in name order, so "company_fk_*" ran before
-- "trg_*" and always saw company_id NULL. Every line insert was rejected and
-- the slip was left saved without lines.
--
-- Re-create the same stamp trigger under a name that sorts before
-- "company_fk_" so company_id is set before the checks run. The function and
-- the checks are unchanged; nothing is dropped except the old trigger name.
BEGIN;

DROP TRIGGER IF EXISTS trg_purchase_receipt_items_stamp_company_id
  ON public.purchase_receipt_items;
DROP TRIGGER IF EXISTS a_purchase_receipt_items_stamp_company_id
  ON public.purchase_receipt_items;
CREATE TRIGGER a_purchase_receipt_items_stamp_company_id
  BEFORE INSERT ON public.purchase_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_receipt_items_stamp_company_id();

COMMENT ON COLUMN public.purchase_receipt_items.company_id IS
  'Denormalised from parent purchase_receipts.company_id. Auto-stamped on insert by a_purchase_receipt_items_stamp_company_id, which must sort before the company_fk_* relationship checks.';

COMMIT;
