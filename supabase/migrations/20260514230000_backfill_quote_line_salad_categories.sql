-- Wave 30.3: backfill quote-line categories that were stored as
-- 'appetizer' but should have been 'salad' or 'starter'.
--
-- Cause: src/components/admin/MenuItemTypeahead.tsx mapCategory()
-- previously folded `salad*` and `starter*` into 'appetizer' because
-- the MenuItemPick.category enum didn't include those values. The
-- quote builder's applyMenuItemPick wrote pick.category straight to
-- the line, persisting the wrong category. Same code path is fixed
-- forward in MenuItemTypeahead.tsx + src/types/app.ts; this
-- migration cleans up rows already on disk.
--
-- Joins each quote line's menu_item_id back to menu_items.category
-- to derive the correct value. Lines without a menu_item_id (free-
-- hand entries) are left alone -- we don't second-guess what the
-- operator actually meant.
--
-- Idempotent: a re-run does nothing because the WHERE clause matches
-- nothing once the first pass settles.
--
-- Pre-flight count on prod was 3 rows (Coleslaw + Curry Noodle Salad
-- variants on spit-braai-delivery quotes).

UPDATE public.quotes q
SET menu_items = (
  SELECT jsonb_agg(
    CASE
      WHEN LOWER(line->>'category') = 'appetizer'
        AND mi.id IS NOT NULL
        AND LOWER(mi.category) LIKE 'salad%'
        THEN jsonb_set(line, '{category}', to_jsonb('salad'::text))
      WHEN LOWER(line->>'category') = 'appetizer'
        AND mi.id IS NOT NULL
        AND LOWER(mi.category) LIKE 'starter%'
        THEN jsonb_set(line, '{category}', to_jsonb('starter'::text))
      ELSE line
    END
    ORDER BY ord.idx
  )
  FROM jsonb_array_elements(q.menu_items) WITH ORDINALITY ord(line, idx)
  LEFT JOIN public.menu_items mi
    ON mi.id = (line->>'menu_item_id')::uuid
   AND mi.company_id = q.company_id
),
updated_at = NOW()
WHERE jsonb_typeof(q.menu_items) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(q.menu_items) line
    JOIN public.menu_items mi
      ON mi.id = (line->>'menu_item_id')::uuid
     AND mi.company_id = q.company_id
    WHERE LOWER(line->>'category') = 'appetizer'
      AND (LOWER(mi.category) LIKE 'salad%' OR LOWER(mi.category) LIKE 'starter%')
  );
