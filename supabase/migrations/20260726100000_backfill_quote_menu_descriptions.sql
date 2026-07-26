-- Quotes snapshot menu lines as JSON so client-visible documents remain
-- historically stable. Older snapshots pre-date the description field,
-- even though their linked catalogue item has one. Backfill only missing
-- descriptions; never overwrite wording already saved on a quote.

WITH rebuilt AS (
  SELECT
    q.id,
    jsonb_agg(
      CASE
        WHEN COALESCE(NULLIF(BTRIM(line.item->>'description'), ''), '') = ''
          AND COALESCE(NULLIF(BTRIM(mi.description), ''), '') <> ''
        THEN line.item || jsonb_build_object('description', mi.description)
        ELSE line.item
      END
      ORDER BY line.ordinality
    ) AS menu_items,
    bool_or(
      COALESCE(NULLIF(BTRIM(line.item->>'description'), ''), '') = ''
      AND COALESCE(NULLIF(BTRIM(mi.description), ''), '') <> ''
    ) AS changed
  FROM public.quotes q
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(q.menu_items) = 'array' THEN q.menu_items
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS line(item, ordinality)
  LEFT JOIN public.menu_items mi
    ON mi.id::text = line.item->>'menu_item_id'
   AND mi.company_id = q.company_id
   AND mi.deleted_at IS NULL
  WHERE q.deleted_at IS NULL
  GROUP BY q.id
)
UPDATE public.quotes q
SET
  menu_items = rebuilt.menu_items,
  updated_at = now()
FROM rebuilt
WHERE q.id = rebuilt.id
  AND rebuilt.changed;
