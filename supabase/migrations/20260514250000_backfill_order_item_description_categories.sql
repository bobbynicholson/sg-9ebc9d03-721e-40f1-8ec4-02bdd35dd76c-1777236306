-- Wave 30.3 part 2: backfill order_items.description for the same
-- rows we corrected on the parent quote.
--
-- postCreationCascade.ts (line 138) stamps order_items.description =
-- quote_line.category at order-creation time. So the same salad/
-- starter -> 'appetizer' bug that hit quotes also landed on every
-- derived order_item row. The orders drawer's Menu Items tab renders
-- description as small italic under the item name -- which is what
-- Callum saw ("Coleslaw / appetizer", "Curry Noodle Salad /
-- appetizer").
--
-- Joins each order_item back to its menu_items master row to derive
-- the corrected category. Idempotent.

UPDATE public.order_items oi
SET description = CASE
  WHEN LOWER(mi.category) LIKE 'salad%'   THEN 'salad'
  WHEN LOWER(mi.category) LIKE 'starter%' THEN 'starter'
  ELSE oi.description
END,
updated_at = NOW()
FROM public.menu_items mi
WHERE mi.id = oi.menu_item_id
  AND LOWER(oi.description) = 'appetizer'
  AND (LOWER(mi.category) LIKE 'salad%' OR LOWER(mi.category) LIKE 'starter%');
