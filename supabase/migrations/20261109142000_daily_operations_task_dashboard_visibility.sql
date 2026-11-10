-- Keep dashboard visibility separate from the team responsible for the task.
-- A Cleaning task is actionable by cleaning staff but visible on both boards.

ALTER TABLE public.daily_operations_tasks
  ADD COLUMN IF NOT EXISTS visible_roles text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.daily_operations_tasks.visible_roles IS
  'Roles whose dashboards display the task; target_roles remains the team allowed to complete it and receive staff reminders.';
