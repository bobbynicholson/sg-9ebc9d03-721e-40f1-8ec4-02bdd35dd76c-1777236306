-- Phase 4 #3: backfill tenant timezone for existing rows.
-- Default to Africa/Johannesburg because every current production
-- tenant is ZA-based. Future tenants must set their own (UK / US
-- pre-launch admins pick from a dropdown on /admin/company-profile).
UPDATE public.companies
   SET timezone = 'Africa/Johannesburg'
 WHERE timezone IS NULL
   AND deleted_at IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN timezone SET DEFAULT 'Africa/Johannesburg';

COMMENT ON COLUMN public.companies.timezone IS
  'IANA timezone for the tenant. Drives date-bucket boundaries in reports, kitchen prep lead time, BCEA pay calc, and the daily cron. Default Africa/Johannesburg (every current tenant is ZA-based).';
