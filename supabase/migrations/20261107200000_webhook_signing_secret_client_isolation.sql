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

    -- The event trigger wrappers call dispatch_webhook; the helper reads and
    -- signs subscriptions. Verify both sides of that chain before revoking
    -- client grants. Checking the wrapper body for table/column names is too
    -- strict because those names are intentionally confined to the helper.
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
