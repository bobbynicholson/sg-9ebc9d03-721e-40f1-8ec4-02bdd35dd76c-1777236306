-- Per-tenant shopping / procurement settings.
--
-- Why this exists:
--   The shopping team-portal Settings page stored every toggle in the
--   browser's localStorage (key cms_shopping_settings_{companyId}). That
--   meant: (1) nothing synced across the team - each device had its own
--   copy; (2) no server-side consumer could ever read the values, so
--   every toggle was a dead control (receipt-required, variance %,
--   lead-time, notify-on-variance all did nothing); (3) clearing browser
--   storage silently reset a company's procurement policy.
--
-- This migration lands one settings row per company so the values are
-- real, shared, and readable by the code paths that should honour them
-- (completeList receipt gate, cost-variance threshold + admin notify,
-- reorder-suggestion default lead time). Realtime is enabled so an edit
-- on one device updates every other open shopping page live.

-- 1. Table (one row per company) -------------------------------------
CREATE TABLE IF NOT EXISTS public.company_shopping_settings (
  company_id                   uuid    NOT NULL PRIMARY KEY
                                 REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Purchase runs
  receipt_required_on_complete boolean NOT NULL DEFAULT true,
  auto_create_list_from_upcoming boolean NOT NULL DEFAULT false,
  upcoming_horizon_days        int     NOT NULL DEFAULT 7  CHECK (upcoming_horizon_days BETWEEN 1 AND 60),
  default_lead_time_days       int     NOT NULL DEFAULT 2  CHECK (default_lead_time_days BETWEEN 0 AND 30),
  -- Variance + budget
  variance_alert_pct           int     NOT NULL DEFAULT 15 CHECK (variance_alert_pct BETWEEN 0 AND 100),
  notify_admin_on_variance     boolean NOT NULL DEFAULT true,
  -- Suppliers + alerts
  prefer_rated_suppliers       boolean NOT NULL DEFAULT true,
  auto_notify_on_low_stock     boolean NOT NULL DEFAULT true,
  -- Audit
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id           uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.company_shopping_settings IS
  'Per-tenant shopping/procurement policy. One row per company. Replaces the old browser-localStorage cms_shopping_settings blob so values sync across the team and are readable server-side.';

-- 2. RLS -------------------------------------------------------------
-- Mirrors company_number_settings: any company member reads their own
-- company row; owner/company_admin/admin (+ super_admin) write. Service
-- role bypasses RLS for cron/server consumers.
ALTER TABLE public.company_shopping_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS css_company_select ON public.company_shopping_settings;
CREATE POLICY css_company_select ON public.company_shopping_settings FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS css_company_insert ON public.company_shopping_settings;
CREATE POLICY css_company_insert ON public.company_shopping_settings FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND COALESCE(active_role, role::text) IN ('owner','company_admin','admin')
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS css_company_update ON public.company_shopping_settings;
CREATE POLICY css_company_update ON public.company_shopping_settings FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND COALESCE(active_role, role::text) IN ('owner','company_admin','admin')
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 3. Realtime --------------------------------------------------------
-- Add to the supabase_realtime publication so an edit on one device
-- pushes a postgres_changes event to every other open shopping page.
-- Guarded: ADD TABLE errors if it is already a member, so check first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'company_shopping_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.company_shopping_settings;
  END IF;
END $$;

-- 4. Backfill --------------------------------------------------------
-- Seed a default row for every existing company so the Settings page
-- and server consumers always find a row. Re-runnable: ON CONFLICT
-- DO NOTHING keeps live edits from being reset by a re-apply.
INSERT INTO public.company_shopping_settings (company_id)
SELECT id FROM public.companies WHERE deleted_at IS NULL
ON CONFLICT (company_id) DO NOTHING;
