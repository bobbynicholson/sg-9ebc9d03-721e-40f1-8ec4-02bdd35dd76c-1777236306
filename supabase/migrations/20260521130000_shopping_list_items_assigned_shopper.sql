-- Shopping persona follow-up (docs/personas/shopping.md 5.4): when
-- two shoppers work the same day they can't see which lines a
-- teammate already claimed. Risk of duplicate purchases.
--
-- Add `assigned_shopper_id` (uuid, nullable) so a shopper claiming
-- a line marks it as theirs. The UI surfaces a "Claimed by @X"
-- badge per row. Nullable for unclaimed lines.
--
-- Why on shopping_list_items (per-line) instead of shopping_lists
-- (per-list)? A typical run is one list with mixed items; two
-- shoppers split the list by section (one does butchery, one does
-- produce). Per-line claim is the only granularity that helps.

ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS assigned_shopper_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_assigned_shopper
  ON public.shopping_list_items(assigned_shopper_id)
  WHERE assigned_shopper_id IS NOT NULL;

COMMENT ON COLUMN public.shopping_list_items.assigned_shopper_id IS
  'Optional FK to profiles(id). When a shopper claims a line, this stores who is on it. Nullable; legacy and unclaimed lines stay NULL.';
