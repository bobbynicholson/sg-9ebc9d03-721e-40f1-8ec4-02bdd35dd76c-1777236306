-- 1. Richer supplier metadata so the suppliers page can show useful
--    fields without having to lump everything in 'notes'.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS preferred_contact_method text DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS supplier_categories text[] DEFAULT '{}';

-- 2. Multi-supplier-per-item join table. Replaces the
--    inventory_items.preferred_supplier_id pattern (which stays for
--    backward compat). Each row carries supplier-specific pricing,
--    pack size and lead time.
CREATE TABLE IF NOT EXISTS public.inventory_item_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  unit_price numeric(10,2),
  pack_size text,
  lead_time_days int,
  is_preferred boolean NOT NULL DEFAULT false,
  notes text,
  last_purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_item_id, supplier_id)
);

ALTER TABLE public.inventory_item_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_iso_inv_item_suppliers" ON public.inventory_item_suppliers;
CREATE POLICY "tenant_iso_inv_item_suppliers" ON public.inventory_item_suppliers FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_iis_supplier ON public.inventory_item_suppliers (supplier_id);
CREATE INDEX IF NOT EXISTS idx_iis_item ON public.inventory_item_suppliers (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_iis_company ON public.inventory_item_suppliers (company_id);

INSERT INTO public.inventory_item_suppliers (company_id, inventory_item_id, supplier_id, unit_price, is_preferred)
SELECT i.company_id, i.id, i.preferred_supplier_id, i.cost_per_unit, true
FROM public.inventory_items i
WHERE i.preferred_supplier_id IS NOT NULL
  AND i.deleted_at IS NULL
ON CONFLICT (inventory_item_id, supplier_id) DO NOTHING;

ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier_id ON public.purchase_receipts (supplier_id);

UPDATE public.purchase_receipts pr
SET supplier_id = s.id
FROM public.suppliers s
WHERE pr.supplier_id IS NULL
  AND pr.vendor IS NOT NULL
  AND pr.company_id = s.company_id
  AND lower(trim(pr.vendor)) = lower(trim(s.supplier_name));

DROP TABLE IF EXISTS public.supplier_prices CASCADE;
