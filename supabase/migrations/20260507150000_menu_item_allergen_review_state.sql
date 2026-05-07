-- P0-15: distinguish "allergen review complete" from "no allergens
-- entered yet" on menu_items.
--
-- Today, allergen_info (text) and allergen_codes (text[]) on menu_items
-- start out NULL / empty for every newly-created item. The kitchen
-- prep view renders that as "no allergens" -- visually identical to a
-- reviewed item that is genuinely allergen-free. A real allergic
-- incident would catch us out.
--
-- Add explicit review-state columns so the kitchen view (and quote
-- builder) can surface a "needs review" badge on items that haven't
-- been gated yet. The UI surface is queued as Phase 2 follow-up; this
-- migration is the data-side P0 lockdown.
--
-- Backfill: any existing menu_items with non-empty allergen_info OR
-- non-empty allergen_codes is treated as reviewed (timestamp = now,
-- reviewer = NULL because we don't know retroactively). New rows
-- start unreviewed.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS allergens_reviewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS allergens_reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: anything with a non-empty allergen field counts as reviewed
-- at migration time so existing menus don't all light up red.
UPDATE public.menu_items
   SET allergens_reviewed_at = COALESCE(allergens_reviewed_at, updated_at, created_at, now())
 WHERE (allergen_info IS NOT NULL AND length(trim(allergen_info)) > 0)
    OR (allergen_codes IS NOT NULL AND array_length(allergen_codes, 1) IS NOT NULL);

-- Index for the kitchen prep query "show me unreviewed items in this
-- company's catalog" -- common page load.
CREATE INDEX IF NOT EXISTS idx_menu_items_company_unreviewed
  ON public.menu_items (company_id)
  WHERE allergens_reviewed_at IS NULL;

COMMENT ON COLUMN public.menu_items.allergens_reviewed_at IS
  'Timestamp when an admin / kitchen lead explicitly reviewed and signed off on the allergen fields. NULL = not yet reviewed; the kitchen prep view should render a "needs review" badge so blank allergens never read as "allergen-free".';

COMMENT ON COLUMN public.menu_items.allergens_reviewed_by IS
  'auth.users.id of whoever signed off on the allergen review.';
