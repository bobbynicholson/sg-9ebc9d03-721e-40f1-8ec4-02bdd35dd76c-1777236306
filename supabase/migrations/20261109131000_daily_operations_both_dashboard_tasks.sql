-- Add an explicit shared-dashboard option for one-off operations tasks.
-- Existing custom_cleaning rows keep their stored target_roles.

ALTER TABLE public.daily_operations_tasks
  DROP CONSTRAINT IF EXISTS daily_operations_task_kind_check,
  ADD CONSTRAINT daily_operations_task_kind_check
    CHECK (task_kind IN ('kitchen_cleaning', 'equipment_cleaning', 'custom_kitchen', 'custom_cleaning', 'custom_both'));

DROP POLICY IF EXISTS daily_operations_tasks_insert ON public.daily_operations_tasks;
CREATE POLICY daily_operations_tasks_insert
  ON public.daily_operations_tasks FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND task_kind IN ('custom_kitchen', 'custom_cleaning', 'custom_both')
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
