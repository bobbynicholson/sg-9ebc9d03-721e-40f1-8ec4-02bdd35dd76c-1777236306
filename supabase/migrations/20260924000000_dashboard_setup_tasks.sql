-- Persist the post-onboarding dashboard checklist per company.
-- One row per company/task means every authorized user sees the same
-- progress, regardless of browser, device, or login session.

CREATE TABLE IF NOT EXISTS public.dashboard_setup_tasks (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, task_id),
  CONSTRAINT dashboard_setup_tasks_task_id_check CHECK (length(trim(task_id)) > 0),
  CONSTRAINT dashboard_setup_tasks_completion_check CHECK (
    (completed = true AND completed_at IS NOT NULL)
    OR (completed = false AND completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS dashboard_setup_tasks_company_idx
  ON public.dashboard_setup_tasks(company_id);

ALTER TABLE public.dashboard_setup_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_setup_tasks_select_company ON public.dashboard_setup_tasks;
CREATE POLICY dashboard_setup_tasks_select_company
  ON public.dashboard_setup_tasks
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS dashboard_setup_tasks_insert_company ON public.dashboard_setup_tasks;
CREATE POLICY dashboard_setup_tasks_insert_company
  ON public.dashboard_setup_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (company_id = get_user_company_id((SELECT auth.uid())) OR is_super_admin())
    AND completed_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS dashboard_setup_tasks_update_company ON public.dashboard_setup_tasks;
CREATE POLICY dashboard_setup_tasks_update_company
  ON public.dashboard_setup_tasks
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  )
  WITH CHECK (
    (company_id = get_user_company_id((SELECT auth.uid())) OR is_super_admin())
    AND completed_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS dashboard_setup_tasks_delete_company ON public.dashboard_setup_tasks;
CREATE POLICY dashboard_setup_tasks_delete_company
  ON public.dashboard_setup_tasks
  FOR DELETE
  TO authenticated
  USING (
    company_id = get_user_company_id((SELECT auth.uid()))
    OR is_super_admin()
  );

CREATE OR REPLACE FUNCTION public.touch_dashboard_setup_task_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dashboard_setup_tasks_updated_at ON public.dashboard_setup_tasks;
CREATE TRIGGER dashboard_setup_tasks_updated_at
  BEFORE UPDATE ON public.dashboard_setup_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_dashboard_setup_task_updated_at();
