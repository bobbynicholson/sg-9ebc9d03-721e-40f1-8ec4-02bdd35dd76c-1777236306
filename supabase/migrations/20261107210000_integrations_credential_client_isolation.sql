-- Restrict legacy integration token columns to trusted server code.
-- WhatsApp uses its separate service-only vault. Sage/Xero legacy rows are
-- outside this rollout; their client-side code will fail closed until those
-- providers are deliberately reimplemented behind server routes.

BEGIN;

DO $$
DECLARE
  safe_columns text;
BEGIN
  IF to_regclass('public.integrations') IS NULL THEN
    RAISE EXCEPTION 'integrations is missing';
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO safe_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'integrations'
    AND column_name NOT IN ('access_token', 'refresh_token', 'credentials');

  REVOKE ALL PRIVILEGES ON TABLE public.integrations FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.integrations TO service_role;
  IF safe_columns IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.integrations TO authenticated', safe_columns);
    EXECUTE format('GRANT INSERT (%s) ON TABLE public.integrations TO authenticated', safe_columns);
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.integrations TO authenticated', safe_columns);
  END IF;
  GRANT DELETE ON TABLE public.integrations TO authenticated;
END $$;

COMMENT ON COLUMN public.integrations.credentials IS
  'Legacy integration payload. Client roles have no access; provider credentials belong in service-only credential vaults.';

COMMIT;
