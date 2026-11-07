-- Move per-company mail credentials behind a server-only encrypted vault.
-- The legacy fields remain temporarily for the app backfill worker, but
-- client roles cannot read or write them after this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_provider_credential_vault (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('smtp', 'mailchimp', 'gmail_oauth', 'ms365_oauth')),
  credentials jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, provider),
  CONSTRAINT email_provider_credential_vault_envelope CHECK (
    jsonb_typeof(credentials) = 'object' AND credentials ? '__encrypted_v1'
  )
);

ALTER TABLE public.email_provider_credential_vault ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.email_provider_credential_vault FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_provider_credential_vault TO service_role;

DO $$
DECLARE
  safe_columns text;
  secret_columns text;
BEGIN
  IF to_regclass('public.email_provider_settings') IS NULL THEN
    RAISE EXCEPTION 'email_provider_settings is missing; apply its schema before the credential vault migration';
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO safe_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'email_provider_settings'
    AND column_name NOT IN ('smtp_pass_encrypted', 'mailchimp_api_key_encrypted', 'oauth_refresh_token_encrypted');

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO secret_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'email_provider_settings'
    AND column_name IN ('smtp_pass_encrypted', 'mailchimp_api_key_encrypted', 'oauth_refresh_token_encrypted');

  -- Remove table-level and old column-level client grants, then restore
  -- access only to ordinary settings. Company RLS policies still apply.
  REVOKE ALL PRIVILEGES ON TABLE public.email_provider_settings FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_provider_settings TO service_role;
  IF secret_columns IS NOT NULL THEN
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.email_provider_settings FROM PUBLIC', secret_columns);
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.email_provider_settings FROM anon, authenticated', secret_columns);
  END IF;
  IF safe_columns IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.email_provider_settings TO authenticated', safe_columns);
    EXECUTE format('GRANT INSERT (%s) ON TABLE public.email_provider_settings TO authenticated', safe_columns);
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.email_provider_settings TO authenticated', safe_columns);
  END IF;
END $$;

COMMENT ON TABLE public.email_provider_credential_vault IS
  'Encrypted company email-provider credentials. Client roles have no table grants or RLS policies; trusted server code uses service_role.';

COMMIT;
