-- Receipt rescan persistence + memory layer.
--
-- Two gaps the rescan drawer had:
--   1. Closing the drawer threw the AI extraction away. The operator
--      had to re-scan from scratch every time they came back.
--   2. No memory of past {vendor, line description} -> {inventory item,
--      tax rule} choices, so a Spar slip the operator had already
--      mapped 5 times still had to be hand-mapped on visit 6.

-- (1) Draft flag on items. Lines extracted by AI land here immediately
-- as drafts (is_draft=true). On Save & receive, we flip them to false.
-- On drawer reopen we load every item for the receipt regardless of
-- draft state, so the operator sees exactly what they left behind.
ALTER TABLE public.purchase_receipt_items
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_receipt_draft
  ON public.purchase_receipt_items(receipt_id, is_draft);

COMMENT ON COLUMN public.purchase_receipt_items.is_draft IS
  'true while AI extraction sits in the drawer pending operator review. Flipped to false on Save & receive.';

-- (2) Per-tenant line memory. Indexed on (company_id, vendor_norm,
-- desc_norm) so the rescan API can pre-fill mappings on the next
-- visit. UPSERT-friendly: same triple updates the latest mapping
-- without piling up history rows.
CREATE TABLE IF NOT EXISTS public.purchase_line_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_norm TEXT NOT NULL,
  description_norm TEXT NOT NULL,
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  suggested_rule_id UUID REFERENCES public.sa_tax_deductibility_rules(id) ON DELETE SET NULL,
  unit_of_measure TEXT,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchase_line_memory_unique UNIQUE (company_id, vendor_norm, description_norm)
);

CREATE INDEX IF NOT EXISTS idx_plm_company_lookup
  ON public.purchase_line_memory(company_id, vendor_norm);

ALTER TABLE public.purchase_line_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plm_select ON public.purchase_line_memory;
DROP POLICY IF EXISTS plm_insert ON public.purchase_line_memory;
DROP POLICY IF EXISTS plm_update ON public.purchase_line_memory;
DROP POLICY IF EXISTS plm_delete ON public.purchase_line_memory;

CREATE POLICY plm_select ON public.purchase_line_memory
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY plm_insert ON public.purchase_line_memory
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY plm_update ON public.purchase_line_memory
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY plm_delete ON public.purchase_line_memory
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

COMMENT ON TABLE public.purchase_line_memory IS
  'Per-tenant memory of {vendor, line description} -> {inventory item, tax rule} choices. Read by the receipt rescan API to pre-fill the drawer with the operator''s previous mapping for the same line on the same vendor.';
