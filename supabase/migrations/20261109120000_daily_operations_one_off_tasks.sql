-- Allow administrators to schedule simple one-off kitchen and cleaning work.
-- A null recurrence_key permits multiple ad-hoc tasks on the same day while
-- recurring instances remain unique per company, task kind, and date.

ALTER TABLE public.company_daily_operations_settings
  ADD COLUMN IF NOT EXISTS kitchen_cleaning_assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS equipment_cleaning_assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.daily_operations_tasks
  DROP CONSTRAINT IF EXISTS daily_operations_task_unique_day,
  DROP CONSTRAINT IF EXISTS daily_operations_task_kind_check,
  ADD COLUMN IF NOT EXISTS recurrence_key text,
  ADD COLUMN IF NOT EXISTS notify_before_hours numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notify_staff boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_admins boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notifications_processed_at timestamptz;

ALTER TABLE public.daily_operations_tasks
  ADD CONSTRAINT daily_operations_task_kind_check
  CHECK (task_kind IN ('kitchen_cleaning', 'equipment_cleaning', 'custom_kitchen', 'custom_cleaning'));

UPDATE public.daily_operations_tasks
SET recurrence_key = task_kind || ':' || task_date::text
WHERE task_kind IN ('kitchen_cleaning', 'equipment_cleaning')
  AND recurrence_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_operations_tasks_recurrence_key
  ON public.daily_operations_tasks(company_id, recurrence_key);

ALTER TABLE public.daily_operations_tasks
  ADD CONSTRAINT daily_operations_task_notify_before_check
  CHECK (notify_before_hours >= 0 AND notify_before_hours <= 72);

DROP POLICY IF EXISTS daily_operations_tasks_insert ON public.daily_operations_tasks;
CREATE POLICY daily_operations_tasks_insert
  ON public.daily_operations_tasks FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND task_kind IN ('custom_kitchen', 'custom_cleaning')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.active_role::text, p.role::text) IN ('super_admin', 'owner', 'company_admin', 'admin')
    )
    AND (
      assigned_to IS NULL
      OR EXISTS (
        SELECT 1 FROM public.profiles assignee
        WHERE assignee.id = assigned_to
          AND assignee.company_id = daily_operations_tasks.company_id
          AND assignee.is_active = true
          AND assignee.deleted_at IS NULL
          AND COALESCE(assignee.active_role::text, assignee.role::text) = ANY(target_roles)
      )
    )
  );

COMMENT ON COLUMN public.daily_operations_tasks.recurrence_key IS
  'Stable uniqueness key for generated recurring instances; null for one-off tasks.';
COMMENT ON COLUMN public.daily_operations_tasks.notify_before_hours IS
  'Lead time for in-app reminders, including future one-off tasks.';
COMMENT ON COLUMN public.daily_operations_tasks.notifications_processed_at IS
  'Scheduler idempotency marker for one-off task reminders.';
COMMENT ON TABLE public.daily_operations_tasks IS
  'Recurring and one-off hygiene/work tasks shown on kitchen and cleaning dashboards.';
