-- Read-only diagnostic for the webhook-grant migration guard.
-- Returns trigger/function metadata and booleans only; it never returns
-- function source code or webhook secrets.

SELECT
  trigger_ns.nspname AS trigger_schema,
  trigger_table.relname AS trigger_table,
  trigger_row.tgname AS trigger_name,
  function_ns.nspname AS function_schema,
  function_row.proname AS function_name,
  function_row.prosecdef AS security_definer,
  COALESCE(function_row.proconfig, ARRAY[]::text[]) AS function_settings,
  function_row.prosrc ILIKE '%webhook_subscriptions%' AS mentions_subscription_table,
  function_row.prosrc ILIKE '%signing_secret%' AS mentions_signing_secret,
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(function_row.proconfig, ARRAY[]::text[])) AS cfg(setting)
    WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) LIKE 'search_path=%'
  ) AS has_fixed_search_path,
  (
    function_row.prosecdef IS TRUE
    AND function_row.prosrc ILIKE '%webhook_subscriptions%'
    AND function_row.prosrc ILIKE '%signing_secret%'
    AND EXISTS (
      SELECT 1
      FROM unnest(COALESCE(function_row.proconfig, ARRAY[]::text[])) AS cfg(setting)
      WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) LIKE 'search_path=%'
    )
  ) AS matches_current_migration_guard
FROM pg_trigger AS trigger_row
JOIN pg_class AS trigger_table ON trigger_table.oid = trigger_row.tgrelid
JOIN pg_namespace AS trigger_ns ON trigger_ns.oid = trigger_table.relnamespace
JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
JOIN pg_namespace AS function_ns ON function_ns.oid = function_row.pronamespace
WHERE NOT trigger_row.tgisinternal
  AND (
    trigger_row.tgname ILIKE '%webhook%'
    OR function_row.proname ILIKE '%webhook%'
    OR function_row.prosrc ILIKE '%webhook%'
    OR function_row.prosrc ILIKE '%signing_secret%'
  )
ORDER BY trigger_ns.nspname, trigger_table.relname, trigger_row.tgname;
