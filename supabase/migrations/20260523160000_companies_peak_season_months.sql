-- FIN-C (financial dashboard follow-ups): per-tenant peak-season window.
--
-- The aiFinancialService Peak Season banner pre-FIN-C hardcoded the SA
-- wedding window (May-September). A US caterer with Q4 holiday peak
-- or a UK caterer with a summer / Christmas double peak couldn't
-- represent their reality; the banner either lied or stayed silent.
--
-- Two int columns (1-12) carry the start + end month inclusive. NULL =
-- "no peak season configured" so existing tenants keep getting the
-- SA-defaults baked into the service, while a tenant that sets the
-- columns drives the banner off real data.
--
-- A CHECK constraint pins values to the calendar-month range. The
-- "end before start" case is allowed (wraps over year-end) - e.g. a US
-- holiday caterer with Nov-Jan would set 11..1, and the service
-- interprets the wrap.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS peak_season_start_month SMALLINT,
  ADD COLUMN IF NOT EXISTS peak_season_end_month SMALLINT;

ALTER TABLE companies
  ADD CONSTRAINT companies_peak_season_start_month_range
    CHECK (peak_season_start_month IS NULL OR (peak_season_start_month BETWEEN 1 AND 12));
ALTER TABLE companies
  ADD CONSTRAINT companies_peak_season_end_month_range
    CHECK (peak_season_end_month IS NULL OR (peak_season_end_month BETWEEN 1 AND 12));

COMMENT ON COLUMN companies.peak_season_start_month IS
  'FIN-C: inclusive start month (1-12) of the tenant''s peak booking season. NULL falls back to SA wedding default May-September in the AI service.';
COMMENT ON COLUMN companies.peak_season_end_month IS
  'FIN-C: inclusive end month (1-12) of the tenant''s peak booking season. Can be < start to wrap year-end (e.g. Nov-Jan = 11..1).';
