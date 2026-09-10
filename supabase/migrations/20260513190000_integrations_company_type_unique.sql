-- Unique key for the per-tenant integration upsert. Audit (May
-- 2026, Wave 7): the WhatsApp connect path now upserts on
-- (company_id, integration_type) so every admin on the same tenant
-- shares one connection. The DB needs a matching unique index for
-- ON CONFLICT to fire correctly. Migrate any duplicate rows first
-- (deactivate older ones, keep the newest).

WITH ranked AS (
  SELECT id, company_id, integration_type,
         ROW_NUMBER() OVER (
           PARTITION BY company_id, integration_type
           ORDER BY connected_at DESC NULLS LAST, created_at DESC NULLS LAST
         ) AS rn
  FROM public.integrations
  WHERE company_id IS NOT NULL
)
UPDATE public.integrations i
SET is_active = false
FROM ranked r
WHERE i.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS integrations_company_type_uniq
  ON public.integrations(company_id, integration_type)
  WHERE company_id IS NOT NULL;
