-- Closes the running-todo "ENABLE RLS on app_config + add
-- admin-only policy". The table is a flat key/value config store
-- (e.g. feature flags, default settings) read by server code via
-- service_role. Anon should never see it; only super_admin can
-- write via the admin UI.

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_super_admin_all ON public.app_config;
CREATE POLICY app_config_super_admin_all
  ON public.app_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.active_role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.active_role = 'super_admin'
    )
  );

-- service_role bypasses RLS by default, so server code that reads
-- app_config via getServiceSupabase() keeps working without an
-- explicit policy.

COMMENT ON TABLE public.app_config IS
  'Global key/value config (feature flags, defaults). RLS on; service_role bypass; super_admin only via UI.';
