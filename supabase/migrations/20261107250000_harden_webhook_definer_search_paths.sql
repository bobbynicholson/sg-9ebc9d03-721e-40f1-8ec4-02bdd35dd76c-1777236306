-- Harden the SECURITY DEFINER webhook helper and its trigger wrappers.
-- PostgreSQL recommends trusted-only schemas in search_path and pg_temp last.

BEGIN;

DO $migration$
DECLARE
  helper_oid oid;
  wrapper record;
BEGIN
  helper_oid := to_regprocedure('public.dispatch_webhook(uuid, text, jsonb)');
  IF helper_oid IS NULL THEN
    RAISE EXCEPTION 'public.dispatch_webhook(uuid, text, jsonb) is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS helper
    WHERE helper.oid = helper_oid
      AND helper.prosecdef IS TRUE
      AND helper.prosrc ILIKE '%webhook_subscriptions%'
      AND helper.prosrc ILIKE '%signing_secret%'
      AND NOT has_function_privilege('anon', helper.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', helper.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Webhook dispatcher is not a protected SECURITY DEFINER helper';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_proc AS wrapper ON wrapper.oid = trigger_row.tgfoid
    WHERE NOT trigger_row.tgisinternal
      AND wrapper.prosrc ILIKE '%dispatch_webhook%'
  ) OR EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_proc AS wrapper ON wrapper.oid = trigger_row.tgfoid
    WHERE NOT trigger_row.tgisinternal
      AND wrapper.prosrc ILIKE '%dispatch_webhook%'
      AND wrapper.prosecdef IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION 'Webhook trigger wrappers are missing or not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public')
     OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    RAISE EXCEPTION 'Expected public and extensions schemas for the dispatcher search_path';
  END IF;

  -- A client must not create shadow objects in schemas used by definer code.
  REVOKE CREATE ON SCHEMA public, extensions
    FROM PUBLIC, anon, authenticated CASCADE;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace AS schema_row
    WHERE schema_row.nspname IN ('public', 'extensions')
      AND (
        has_schema_privilege('anon', schema_row.oid, 'CREATE')
        OR has_schema_privilege('authenticated', schema_row.oid, 'CREATE')
      )
  ) THEN
    RAISE EXCEPTION 'Client CREATE access remains on a SECURITY DEFINER search_path schema';
  END IF;

  ALTER FUNCTION public.dispatch_webhook(uuid, text, jsonb)
    SET search_path = pg_catalog, public, extensions, pg_temp;

  -- Only trigger functions that actually call the protected helper are changed.
  FOR wrapper IN
    SELECT DISTINCT function_ns.nspname, function_row.proname
    FROM pg_trigger AS trigger_row
    JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace AS function_ns ON function_ns.oid = function_row.pronamespace
    WHERE NOT trigger_row.tgisinternal
      AND function_row.prosrc ILIKE '%dispatch_webhook%'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I() SET search_path = pg_catalog, public, pg_temp',
      wrapper.nspname,
      wrapper.proname
    );
  END LOOP;
END;
$migration$;

COMMIT;
