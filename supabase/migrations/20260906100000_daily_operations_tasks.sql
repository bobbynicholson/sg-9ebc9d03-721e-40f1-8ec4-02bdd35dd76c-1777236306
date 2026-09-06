-- Daily operations: tenant-configurable recurring kitchen and equipment
-- cleaning. These are intentionally separate from order-linked cleaning
-- records so a daily hygiene task never changes an order's equipment ledger.

ALTER TYPE public.notification_type
  ADD VALUE IF NOT EXISTS 'daily_operations_task';

CREATE TABLE IF NOT EXISTS public.company_daily_operations_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  kitchen_cleaning_enabled boolean NOT NULL DEFAULT false,
  kitchen_cleaning_time time NOT NULL DEFAULT '09:00',
  kitchen_cleaning_title text NOT NULL DEFAULT 'Clean kitchen area',
  kitchen_cleaning_description text NOT NULL DEFAULT 'Clean and reset the kitchen work area for the next service.',
  kitchen_cleaning_lead_hours numeric(5,2) NOT NULL DEFAULT 2,
  kitchen_cleaning_target text NOT NULL DEFAULT 'kitchen',
  equipment_cleaning_enabled boolean NOT NULL DEFAULT false,
  equipment_cleaning_time time NOT NULL DEFAULT '17:00',
  equipment_cleaning_title text NOT NULL DEFAULT 'Clean kitchen equipment',
  equipment_cleaning_description text NOT NULL DEFAULT 'Clean and sanitise the equipment used to prepare orders.',
  equipment_cleaning_lead_hours numeric(5,2) NOT NULL DEFAULT 2,
  equipment_cleaning_target text NOT NULL DEFAULT 'cleaning',
  admin_notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_daily_operations_kitchen_target_check
    CHECK (kitchen_cleaning_target IN ('kitchen', 'cleaning', 'both')),
  CONSTRAINT company_daily_operations_equipment_target_check
    CHECK (equipment_cleaning_target IN ('kitchen', 'cleaning', 'both')),
  CONSTRAINT company_daily_operations_lead_hours_check
    CHECK (kitchen_cleaning_lead_hours >= 0 AND kitchen_cleaning_lead_hours <= 72
       AND equipment_cleaning_lead_hours >= 0 AND equipment_cleaning_lead_hours <= 72)
);

CREATE TABLE IF NOT EXISTS public.daily_operations_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_kind text NOT NULL,
  task_date date NOT NULL,
  scheduled_time time NOT NULL,
  scheduled_at timestamptz,
  title text NOT NULL,
  description text,
  target_roles text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'scheduled',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  staff_notified_at timestamptz,
  admin_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_operations_task_kind_check
    CHECK (task_kind IN ('kitchen_cleaning', 'equipment_cleaning')),
  CONSTRAINT daily_operations_task_status_check
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'skipped')),
  CONSTRAINT daily_operations_task_unique_day UNIQUE (company_id, task_kind, task_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_operations_tasks_company_date
  ON public.daily_operations_tasks(company_id, task_date, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_daily_operations_tasks_open
  ON public.daily_operations_tasks(company_id, status, task_date);

DROP TRIGGER IF EXISTS update_company_daily_operations_settings_updated_at
  ON public.company_daily_operations_settings;
CREATE TRIGGER update_company_daily_operations_settings_updated_at
  BEFORE UPDATE ON public.company_daily_operations_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_operations_tasks_updated_at
  ON public.daily_operations_tasks;
CREATE TRIGGER update_daily_operations_tasks_updated_at
  BEFORE UPDATE ON public.daily_operations_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.company_daily_operations_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_operations_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_operations_settings_select ON public.company_daily_operations_settings;
CREATE POLICY daily_operations_settings_select
  ON public.company_daily_operations_settings FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS daily_operations_settings_write ON public.company_daily_operations_settings;
CREATE POLICY daily_operations_settings_write
  ON public.company_daily_operations_settings FOR ALL
  USING (
    company_id = get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.active_role::text, p.role::text) IN ('super_admin', 'owner', 'company_admin', 'admin')
    )
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.active_role::text, p.role::text) IN ('super_admin', 'owner', 'company_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS daily_operations_tasks_select ON public.daily_operations_tasks;
CREATE POLICY daily_operations_tasks_select
  ON public.daily_operations_tasks FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS daily_operations_tasks_update ON public.daily_operations_tasks;
CREATE POLICY daily_operations_tasks_update
  ON public.daily_operations_tasks FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

COMMENT ON TABLE public.company_daily_operations_settings IS
  'Company-admin configuration for one daily kitchen-area cleaning and one daily kitchen-equipment cleaning task.';
COMMENT ON TABLE public.daily_operations_tasks IS
  'Idempotent daily hygiene task instances generated from company_daily_operations_settings.';
