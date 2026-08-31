-- Company-controlled live-data access for the shared AI brain.
--
-- This is a policy switch, not raw database access. The server still uses
-- curated, role-scoped queries in src/server/chatbot/brain.ts and never gives
-- the model SQL credentials or arbitrary table access.

CREATE TABLE IF NOT EXISTS public.ai_brain_access_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'owner', 'company_admin', 'region_admin', 'sales_admin', 'admin',
    'kitchen_manager', 'kitchen_staff', 'shopping_staff', 'shopping',
    'driver', 'waiter', 'cleaning_manager', 'cleaning_staff', 'client',
    'staff', 'super_admin'
  )),
  live_data_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, role)
);

CREATE INDEX IF NOT EXISTS idx_ai_brain_access_company_role
  ON public.ai_brain_access_policies (company_id, role);

ALTER TABLE public.ai_brain_access_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_brain_access_read ON public.ai_brain_access_policies;
CREATE POLICY ai_brain_access_read ON public.ai_brain_access_policies
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.active_role, p.role::text) IN ('super_admin', 'owner', 'company_admin')
  ));

DROP POLICY IF EXISTS ai_brain_access_write ON public.ai_brain_access_policies;
CREATE POLICY ai_brain_access_write ON public.ai_brain_access_policies
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.active_role, p.role::text) IN ('super_admin', 'owner', 'company_admin')
  ))
  WITH CHECK (company_id IN (
    SELECT p.company_id FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.active_role, p.role::text) IN ('super_admin', 'owner', 'company_admin')
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_brain_access_policies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_brain_access_policies;
  END IF;
END $$;

COMMENT ON TABLE public.ai_brain_access_policies IS
  'Company toggles for curated, role-scoped live data in the AI brain; never raw database access.';
