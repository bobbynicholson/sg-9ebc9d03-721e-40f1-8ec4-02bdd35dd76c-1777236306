-- Corrective hardening: remove any effective client grants that remain on
-- webhook signing secrets and target URLs, then restore only safe metadata.

BEGIN;

DO $$
DECLARE
  safe_columns text;
BEGIN
  IF to_regclass('public.webhook_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'webhook_subscriptions is missing';
  END IF;

  -- Keep the database dispatcher working only when its security boundary is
  -- still verifiable before changing the client grants.
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
    RAISE EXCEPTION 'Could not verify a SECURITY DEFINER webhook dispatcher with fixed search_path';
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO safe_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'webhook_subscriptions'
    AND column_name NOT IN ('signing_secret', 'target_url');

  -- CASCADE also removes grants that were delegated from these client roles.
  REVOKE ALL PRIVILEGES ON TABLE public.webhook_subscriptions
    FROM PUBLIC, anon, authenticated CASCADE;
  REVOKE ALL PRIVILEGES (signing_secret, target_url) ON TABLE public.webhook_subscriptions
    FROM PUBLIC, anon, authenticated CASCADE;

  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_subscriptions TO service_role;
  IF safe_columns IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.webhook_subscriptions TO authenticated', safe_columns);
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.webhook_subscriptions TO authenticated', safe_columns);
  END IF;
  GRANT DELETE ON TABLE public.webhook_subscriptions TO authenticated;
END $$;

COMMIT;
