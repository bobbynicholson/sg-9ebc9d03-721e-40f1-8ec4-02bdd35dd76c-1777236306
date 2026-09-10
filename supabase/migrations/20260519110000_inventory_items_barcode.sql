-- SHP2-H (shopping deep audit, SHP2-22): barcode column on
-- inventory_items so the shopper can scan a product at the till and
-- have the matching shopping-list row tick automatically.
-- See PR for the full rationale.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_company_barcode
  ON public.inventory_items (company_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode_lookup
  ON public.inventory_items (company_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.inventory_items.barcode IS
  'Optional EAN/UPC/QR for shopper barcode scan (SHP2-H). Unique per company_id; NULL allowed for un-barcoded items.';
