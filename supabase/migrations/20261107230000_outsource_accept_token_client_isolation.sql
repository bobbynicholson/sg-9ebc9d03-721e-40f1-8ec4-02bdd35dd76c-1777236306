-- Outsource acceptance links are bearer credentials. Keep them out of
-- company-staff reads and expose a link only through the authorized admin API.

BEGIN;

DO $$
DECLARE
  safe_columns text;
BEGIN
  IF to_regclass('public.outsource_assignments') IS NULL THEN
    RAISE EXCEPTION 'outsource_assignments is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outsource_assignments'
      AND column_name = 'accept_token'
  ) THEN
    RAISE EXCEPTION 'outsource_assignments.accept_token is missing';
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO safe_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'outsource_assignments'
    AND column_name <> 'accept_token';

  -- Remove existing table and column SELECT grants first. Regrant safe row
  -- fields only; preserve the existing RLS-scoped write behavior.
  REVOKE SELECT ON TABLE public.outsource_assignments FROM PUBLIC, anon, authenticated;
  REVOKE SELECT (accept_token) ON TABLE public.outsource_assignments FROM PUBLIC, anon, authenticated;

  IF safe_columns IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.outsource_assignments TO authenticated', safe_columns);
  END IF;

  -- Trusted server code needs full access for public link verification,
  -- reminder delivery, and assignment workflows.
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.outsource_assignments TO service_role;
END $$;

COMMENT ON COLUMN public.outsource_assignments.accept_token IS
  'Bearer credential for provider acceptance. Browser roles have no column access; trusted server APIs release links only to authorized company admins.';

COMMIT;
