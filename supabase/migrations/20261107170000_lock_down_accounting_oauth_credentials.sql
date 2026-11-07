-- OAuth access and refresh tokens must only be read by trusted server code.
-- The invoice page now calls same-origin API routes, so browser clients no
-- longer need direct access to accounting_integrations.
BEGIN;

ALTER TABLE public.accounting_integrations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  existing_policy RECORD;
  column_list TEXT;
  grantee TEXT;
BEGIN
  -- Remove every policy on this credential-bearing table. Server code uses
  -- service_role, which bypasses RLS; client roles should receive no policy.
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'accounting_integrations'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.accounting_integrations', existing_policy.policyname);
  END LOOP;

  REVOKE ALL PRIVILEGES ON TABLE public.accounting_integrations FROM PUBLIC, anon, authenticated;

  -- Remove any column-level grants as well as table-level grants.
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO column_list
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'accounting_integrations';
  IF column_list IS NOT NULL THEN
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.accounting_integrations FROM PUBLIC', column_list);
    FOREACH grantee IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.accounting_integrations FROM %I', column_list, grantee);
    END LOOP;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounting_integrations TO service_role;

COMMIT;
