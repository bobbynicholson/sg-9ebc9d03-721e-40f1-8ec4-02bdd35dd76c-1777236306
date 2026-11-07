-- Keep the signing secret available to the database-owned event dispatcher,
-- while preventing browsers from selecting, inserting, or changing it.
-- Webhook delivery still requires the raw secret for HMAC signing, so this
-- migration isolates it from client roles rather than encrypting it in-place.

BEGIN;

DO $$
DECLARE
  safe_columns text;
BEGIN
  IF to_regclass('public.webhook_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'webhook_subscriptions is missing';
  END IF;

  -- The event trigger must already read and sign as a tightly controlled
  -- SECURITY DEFINER function. If its source is not visible here, stop and
  -- inspect the live trigger before removing client column grants.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_trigger AS t ON t.tgfoid = p.oid AND NOT t.tgisinternal
    WHERE n.nspname = 'public'
      AND p.prosecdef IS TRUE
      AND p.prosrc ILIKE '%webhook_subscriptions%'
      AND p.prosrc ILIKE '%signing_secret%'
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(setting)
        WHERE cfg.setting ILIKE 'search_path=%'
      )
  ) THEN
    RAISE EXCEPTION 'Could not verify a SECURITY DEFINER webhook dispatcher with a fixed search_path; inspect the live trigger before applying client grant changes';
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO safe_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'webhook_subscriptions'
    AND column_name NOT IN ('signing_secret', 'target_url');

  REVOKE ALL PRIVILEGES ON TABLE public.webhook_subscriptions FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_subscriptions TO service_role;

  REVOKE ALL PRIVILEGES (signing_secret, target_url) ON TABLE public.webhook_subscriptions FROM PUBLIC, anon, authenticated;
  IF safe_columns IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.webhook_subscriptions TO authenticated', safe_columns);
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.webhook_subscriptions TO authenticated', safe_columns);
  END IF;
  GRANT DELETE ON TABLE public.webhook_subscriptions TO authenticated;
END $$;

COMMENT ON COLUMN public.webhook_subscriptions.signing_secret IS
  'Plaintext is retained for database event HMAC dispatch. Client roles have no access; encrypting requires moving signing into trusted server code first.';

COMMENT ON COLUMN public.webhook_subscriptions.target_url IS
  'Outbound webhook URLs can contain bearer-like path tokens. Client roles have no access; trusted admin APIs return only the host.';

COMMIT;
