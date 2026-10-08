-- Company time format: how every time in the portal is shown.
--   '24h' -> 14:30 (default; what the portal shows today)
--   '12h' -> 2:30 PM
-- Chosen on Company profile > Region & currency, next to the
-- company time zone (companies.timezone). Both apply to every page
-- of the portal, whatever country the viewer is in (src/lib/portalTime.ts).
--
-- Additive: new column with a default, nothing existing changes.
-- Idempotent - safe to run repeatedly.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS time_format text NOT NULL DEFAULT '24h';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'companies_time_format_check'
       AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_time_format_check CHECK (time_format IN ('24h', '12h'));
  END IF;
END $$;

COMMENT ON COLUMN public.companies.time_format IS
  'How times are shown across the portal: 24h (14:30) or 12h (2:30 PM). Used with companies.timezone.';
