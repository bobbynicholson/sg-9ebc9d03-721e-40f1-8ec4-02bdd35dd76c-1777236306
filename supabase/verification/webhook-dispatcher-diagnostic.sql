-- Read-only diagnostic for the webhook-grant migration guard.
-- Returns trigger/function metadata and booleans only; it never returns
-- function source code or webhook secrets.

-- Trigger wrappers should call the protected dispatch_webhook helper,
-- run SECURITY DEFINER, and have a pinned search_path.
SELECT
  trigger_ns.nspname AS trigger_schema,
  trigger_table.relname AS trigger_table,
  trigger_row.tgname AS trigger_name,
  function_ns.nspname AS function_schema,
  wrapper.proname AS function_name,
  wrapper.prosecdef AS security_definer,
  COALESCE(wrapper.proconfig, ARRAY[]::text[]) AS function_settings,
  wrapper.prosrc ILIKE '%dispatch_webhook%' AS calls_dispatch_webhook,
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(wrapper.proconfig, ARRAY[]::text[])) AS cfg(setting)
    WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) LIKE 'search_path=%'
  ) AS has_fixed_search_path,
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(wrapper.proconfig, ARRAY[]::text[])) AS cfg(setting)
    WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) =
      'search_path=pg_catalog,public,pg_temp'
  ) AS has_safe_search_path
FROM pg_trigger AS trigger_row
JOIN pg_class AS trigger_table ON trigger_table.oid = trigger_row.tgrelid
JOIN pg_namespace AS trigger_ns ON trigger_ns.oid = trigger_table.relnamespace
JOIN pg_proc AS wrapper ON wrapper.oid = trigger_row.tgfoid
JOIN pg_namespace AS function_ns ON function_ns.oid = wrapper.pronamespace
WHERE NOT trigger_row.tgisinternal
  AND wrapper.prosrc ILIKE '%dispatch_webhook%'
ORDER BY trigger_ns.nspname, trigger_table.relname, trigger_row.tgname;

-- The helper itself should read/sign subscriptions, be protected, and not
-- be callable by anon/authenticated roles.
SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  COALESCE(p.proconfig, ARRAY[]::text[]) AS function_settings,
  p.prosrc ILIKE '%webhook_subscriptions%' AS mentions_subscription_table,
  p.prosrc ILIKE '%signing_secret%' AS mentions_signing_secret,
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(setting)
    WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) LIKE 'search_path=%'
  ) AS has_fixed_search_path,
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(setting)
    WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) =
      'search_path=pg_catalog,public,extensions,pg_temp'
  ) AS has_safe_search_path,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE p.oid = to_regprocedure('public.dispatch_webhook(uuid, text, jsonb)');

-- Effective client CREATE privileges on any schema used by the helper.
SELECT
  schema_row.nspname AS schema_name,
  has_schema_privilege('anon', schema_row.oid, 'CREATE') AS anon_can_create,
  has_schema_privilege('authenticated', schema_row.oid, 'CREATE') AS authenticated_can_create
FROM pg_namespace AS schema_row
WHERE schema_row.nspname IN ('public', 'extensions')
ORDER BY schema_row.nspname;
