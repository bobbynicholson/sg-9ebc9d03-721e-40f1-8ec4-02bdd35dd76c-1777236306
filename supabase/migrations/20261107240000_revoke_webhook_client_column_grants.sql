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

  -- Verify the protected helper and its trigger wrappers. The trigger bodies
  -- call dispatch_webhook; they do not directly mention its tables/columns.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS helper
    WHERE helper.oid = to_regprocedure('public.dispatch_webhook(uuid, text, jsonb)')
      AND helper.prosecdef IS TRUE
      AND helper.prosrc ILIKE '%webhook_subscriptions%'
      AND helper.prosrc ILIKE '%signing_secret%'
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(helper.proacl, acldefault('f', helper.proowner))) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
      AND NOT has_function_privilege('anon', helper.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', helper.oid, 'EXECUTE')
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(helper.proconfig, ARRAY[]::text[])) AS cfg(setting)
        WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) LIKE 'search_path=%'
      )
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_proc AS wrapper ON wrapper.oid = trigger_row.tgfoid
    WHERE NOT trigger_row.tgisinternal
      AND wrapper.prosrc ILIKE '%dispatch_webhook%'
      AND wrapper.prosecdef IS TRUE
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(wrapper.proconfig, ARRAY[]::text[])) AS cfg(setting)
        WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) LIKE 'search_path=%'
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_proc AS wrapper ON wrapper.oid = trigger_row.tgfoid
    WHERE NOT trigger_row.tgisinternal
      AND wrapper.prosrc ILIKE '%dispatch_webhook%'
      AND (
        wrapper.prosecdef IS DISTINCT FROM TRUE
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(wrapper.proconfig, ARRAY[]::text[])) AS cfg(setting)
          WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) LIKE 'search_path=%'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Could not verify the protected dispatch_webhook helper/trigger chain; run supabase/verification/webhook-dispatcher-diagnostic.sql before retrying';
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
