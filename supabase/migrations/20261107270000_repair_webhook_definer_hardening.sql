-- Idempotent repair for deployments where the initial webhook definer
-- hardening migration was not applied or did not take effect.

BEGIN;

DO $precheck$
DECLARE
  helper_oid oid := to_regprocedure('public.dispatch_webhook(uuid, text, jsonb)');
BEGIN
  IF helper_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS helper
    WHERE helper.oid = helper_oid
      AND helper.prosecdef IS TRUE
      AND helper.prosrc ILIKE '%webhook_subscriptions%'
      AND helper.prosrc ILIKE '%signing_secret%'
      AND NOT has_function_privilege('anon', helper.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', helper.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'The protected SECURITY DEFINER webhook dispatcher is missing or unsafe';
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
    RAISE EXCEPTION 'Expected public and extensions schemas for the webhook dispatcher';
  END IF;
END;
$precheck$;

-- Run ACL/function DDL outside the procedural block so the effects are
-- unambiguous in the SQL editor and are committed atomically.
REVOKE CREATE ON SCHEMA public, extensions FROM PUBLIC, anon, authenticated CASCADE;

ALTER FUNCTION public.dispatch_webhook(uuid, text, jsonb)
  SET search_path = pg_catalog, public, extensions, pg_temp;

DO $repair_wrappers$
DECLARE
  wrapper record;
BEGIN
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
$repair_wrappers$;

DO $postcheck$
DECLARE
  remaining_schema_access text;
  unsafe_wrappers text;
BEGIN
  SELECT string_agg(
    format('%I (anon=%s, authenticated=%s)', schema_row.nspname,
      has_schema_privilege('anon', schema_row.oid, 'CREATE'),
      has_schema_privilege('authenticated', schema_row.oid, 'CREATE')),
    ', ' ORDER BY schema_row.nspname
  ) INTO remaining_schema_access
  FROM pg_namespace AS schema_row
  WHERE schema_row.nspname IN ('public', 'extensions')
    AND (
      has_schema_privilege('anon', schema_row.oid, 'CREATE')
      OR has_schema_privilege('authenticated', schema_row.oid, 'CREATE')
    );

  IF remaining_schema_access IS NOT NULL THEN
    RAISE EXCEPTION 'Client CREATE access remains on dispatcher schemas: %', remaining_schema_access;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS helper
    WHERE helper.oid = to_regprocedure('public.dispatch_webhook(uuid, text, jsonb)')
      AND helper.prosecdef IS TRUE
      AND NOT has_function_privilege('anon', helper.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', helper.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(helper.proacl, acldefault('f', helper.proowner))) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(helper.proconfig, ARRAY[]::text[])) AS cfg(setting)
        WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) =
          'search_path=pg_catalog,public,extensions,pg_temp'
      )
  ) THEN
    RAISE EXCEPTION 'Webhook dispatcher post-check failed: helper path or execute grants are unsafe';
  END IF;

  SELECT string_agg(format('%I.%I', function_ns.nspname, function_row.proname), ', ')
    INTO unsafe_wrappers
  FROM (
    SELECT DISTINCT wrapper.oid, wrapper.proname, wrapper.prosecdef, wrapper.proconfig, wrapper.pronamespace
    FROM pg_trigger AS trigger_row
    JOIN pg_proc AS wrapper ON wrapper.oid = trigger_row.tgfoid
    WHERE NOT trigger_row.tgisinternal
      AND wrapper.prosrc ILIKE '%dispatch_webhook%'
  ) AS function_row
  JOIN pg_namespace AS function_ns ON function_ns.oid = function_row.pronamespace
  WHERE function_row.prosecdef IS DISTINCT FROM TRUE
     OR NOT EXISTS (
       SELECT 1
       FROM unnest(COALESCE(function_row.proconfig, ARRAY[]::text[])) AS cfg(setting)
       WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) =
         'search_path=pg_catalog,public,pg_temp'
     );

  IF unsafe_wrappers IS NOT NULL THEN
    RAISE EXCEPTION 'Webhook trigger wrapper post-check failed: %', unsafe_wrappers;
  END IF;
END;
$postcheck$;

COMMIT;
