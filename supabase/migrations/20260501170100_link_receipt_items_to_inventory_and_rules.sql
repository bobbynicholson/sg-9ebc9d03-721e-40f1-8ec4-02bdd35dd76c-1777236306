-- Wire receipt lines to two things they were missing:
--   inventory_item_id  -> when the line item is something we stock,
--                         this lets the slip drive a receiveStock() call.
--   suggested_rule_id  -> the AI's deductibility classification, kept
--                         alongside the operator's final is_deductible flag
--                         so we can train / audit the suggestion quality.

ALTER TABLE public.purchase_receipt_items
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_rule_id uuid REFERENCES public.sa_tax_deductibility_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity numeric(10,3),
  ADD COLUMN IF NOT EXISTS unit_of_measure text,
  ADD COLUMN IF NOT EXISTS unit_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS inventory_received_at timestamptz;

COMMENT ON COLUMN public.purchase_receipt_items.inventory_item_id IS
  'When set, this slip line was reconciled against an inventory_items row. Drives the receive-to-stock action.';
COMMENT ON COLUMN public.purchase_receipt_items.suggested_rule_id IS
  'AI suggestion from sa_tax_deductibility_rules. Operator can override is_deductible / category.';
COMMENT ON COLUMN public.purchase_receipt_items.inventory_received_at IS
  'Timestamp of receiveStock() call. Null = not yet added to stock.';

CREATE INDEX IF NOT EXISTS idx_pri_inventory_item ON public.purchase_receipt_items (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_pri_rule ON public.purchase_receipt_items (suggested_rule_id);
