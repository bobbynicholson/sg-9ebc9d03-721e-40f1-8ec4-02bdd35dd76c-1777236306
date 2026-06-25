ALTER TABLE public.shopping_lists
  ADD COLUMN IF NOT EXISTS no_receipt_reason text;

COMMENT ON COLUMN public.shopping_lists.no_receipt_reason IS
  'Required explanation when a shopping list is completed without an attached receipt image.';
