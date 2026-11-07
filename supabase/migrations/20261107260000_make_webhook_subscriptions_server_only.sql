-- Webhook configuration is read and changed through authenticated server APIs.
-- No browser role needs direct table access.

BEGIN;

DO $migration$
DECLARE
  policy_row record;
  column_list text;
BEGIN
  IF to_regclass('public.webhook_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'webhook_subscriptions is missing';
  END IF;

  ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'webhook_subscriptions'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.webhook_subscriptions', policy_row.policyname);
  END LOOP;

  REVOKE ALL PRIVILEGES ON TABLE public.webhook_subscriptions
    FROM PUBLIC, anon, authenticated CASCADE;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO column_list
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'webhook_subscriptions';
  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.webhook_subscriptions FROM PUBLIC CASCADE',
      column_list
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.webhook_subscriptions FROM anon CASCADE',
      column_list
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.webhook_subscriptions FROM authenticated CASCADE',
      column_list
    );
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_subscriptions TO service_role;
END;
$migration$;

COMMIT;
