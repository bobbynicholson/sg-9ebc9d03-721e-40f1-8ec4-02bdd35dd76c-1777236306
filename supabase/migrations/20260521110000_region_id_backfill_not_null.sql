-- Phase 6 follow-up #4: backfill region_id on existing rows + add
-- NOT NULL constraint so new rows are forced through the region-aware
-- path. The Phase 5 follow-up (PR #216) added default-region creation
-- at onboarding completion, so going forward every tenant has at
-- least one region. This migration cleans up the historical NULLs.
--
-- Live data at the time of writing (one tenant, Spit Braai Delivery):
--   orders   : 0 NULL region_id
--   quotes   : 3 NULL
--   clients  : 6596 NULL
--   leads    : 6 NULL
--
-- Strategy: for each NULL row, set region_id to the first active
-- region of the row's company_id. Companies without any region get
-- a default "Main" region inline (defensive - the Phase 5 follow-up
-- creates these at onboarding, but a legacy tenant signed up before
-- that PR may not have one yet).
--
-- The NOT NULL constraint is added AFTER the backfill in the same
-- transaction so a backfill miss aborts the whole migration rather
-- than leaving a half-applied schema.

-- Step 1: ensure every company has at least one active region.
-- Defensive insert - mirrors the inline logic in
-- onboardingProgressService.markComplete (Phase 5 follow-up PR #216).
INSERT INTO public.regions (company_id, name, code, country, is_active, notes)
SELECT
  c.id,
  'Main',
  'MAIN',
  COALESCE(c.country, 'ZA'),
  true,
  'Auto-created during Phase 6 region backfill (20260521110000). Rename or split from /admin/regions.'
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.regions r WHERE r.company_id = c.id AND r.is_active = true
);

-- Step 2: backfill NULL region_id on each affected table. The CTE
-- picks the most recently created active region per company so the
-- backfill is deterministic if a company has multiple regions.
WITH default_region AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    id AS region_id
  FROM public.regions
  WHERE is_active = true
  ORDER BY company_id, created_at ASC
)
UPDATE public.orders o
SET region_id = d.region_id
FROM default_region d
WHERE o.region_id IS NULL
  AND o.company_id = d.company_id;

WITH default_region AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    id AS region_id
  FROM public.regions
  WHERE is_active = true
  ORDER BY company_id, created_at ASC
)
UPDATE public.quotes q
SET region_id = d.region_id
FROM default_region d
WHERE q.region_id IS NULL
  AND q.company_id = d.company_id;

WITH default_region AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    id AS region_id
  FROM public.regions
  WHERE is_active = true
  ORDER BY company_id, created_at ASC
)
UPDATE public.clients cl
SET region_id = d.region_id
FROM default_region d
WHERE cl.region_id IS NULL
  AND cl.company_id = d.company_id;

WITH default_region AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    id AS region_id
  FROM public.regions
  WHERE is_active = true
  ORDER BY company_id, created_at ASC
)
UPDATE public.leads l
SET region_id = d.region_id
FROM default_region d
WHERE l.region_id IS NULL
  AND l.company_id = d.company_id;

-- Step 3: confirm no NULL region_id remains where company_id is
-- non-null. If anything slipped through (e.g. an orphaned row with
-- company_id NULL), raise so the migration aborts before NOT NULL.
DO $$
DECLARE
  v_orders int;
  v_quotes int;
  v_clients int;
  v_leads int;
BEGIN
  SELECT count(*) INTO v_orders FROM public.orders WHERE region_id IS NULL AND company_id IS NOT NULL;
  SELECT count(*) INTO v_quotes FROM public.quotes WHERE region_id IS NULL AND company_id IS NOT NULL;
  SELECT count(*) INTO v_clients FROM public.clients WHERE region_id IS NULL AND company_id IS NOT NULL;
  SELECT count(*) INTO v_leads FROM public.leads WHERE region_id IS NULL AND company_id IS NOT NULL;
  IF v_orders > 0 OR v_quotes > 0 OR v_clients > 0 OR v_leads > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: orders=%, quotes=%, clients=%, leads=%',
      v_orders, v_quotes, v_clients, v_leads;
  END IF;
END $$;

-- Step 4: add NOT NULL constraints. Note: rows with NULL company_id
-- (genuinely orphaned data) still have NULL region_id at this point.
-- We don't NOT NULL company_id here - that's a separate decision -
-- but we accept that an orphan row may have NULL region_id too. The
-- constraint is enforced as NOT VALID first so a single transaction
-- doesn't have to re-scan the whole table; the VALIDATE step then
-- runs the actual check.
--
-- For each table, the column was nullable before. We make it NOT
-- NULL via ALTER COLUMN. Postgres requires the rewrite to happen
-- inside the same statement, so we accept the table-scan cost (the
-- tables are small enough that it's not worth the multi-step dance).

ALTER TABLE public.orders   ALTER COLUMN region_id SET NOT NULL;
ALTER TABLE public.quotes   ALTER COLUMN region_id SET NOT NULL;
ALTER TABLE public.clients  ALTER COLUMN region_id SET NOT NULL;
ALTER TABLE public.leads    ALTER COLUMN region_id SET NOT NULL;

COMMENT ON COLUMN public.orders.region_id IS
  'NOT NULL since 20260521110000. New rows must carry a region. Phase 5 follow-up + Phase 6 wrap-up.';
COMMENT ON COLUMN public.quotes.region_id IS
  'NOT NULL since 20260521110000. New rows must carry a region.';
COMMENT ON COLUMN public.clients.region_id IS
  'NOT NULL since 20260521110000. New rows must carry a region.';
COMMENT ON COLUMN public.leads.region_id IS
  'NOT NULL since 20260521110000. New rows must carry a region.';
