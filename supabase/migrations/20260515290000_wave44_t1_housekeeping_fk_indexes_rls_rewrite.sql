-- Wave 44 Tier 1 -- DB advisor housekeeping for Wave 41/42 tables.
--
-- Three classes of warning addressed in one migration:
--
-- 1. unindexed_foreign_keys (3 FKs across cleaning_jobs +
--    kitchen_shifts) -- without a covering index, every parent
--    delete + every join scans the child table.
--
-- 2. auth_rls_initplan (10 policies) -- bare auth.uid() in RLS is
--    re-evaluated per row. Wrapping in (SELECT auth.uid())
--    triggers Postgres init-plan caching: one call per query
--    instead of one per row. Same for the (SELECT company_id ...)
--    sub-selects that drive tenant scope.
--
-- 3. multiple_permissive_policies (50 entries across Wave 41/42
--    tables) -- our admin_write / team_write / self_write FOR
--    ALL policies overlap with company_select on the SELECT path,
--    so the planner runs both per row. Split each FOR ALL into
--    action-specific (FOR INSERT / UPDATE / DELETE) policies so
--    SELECT has one and only one permissive policy.

CREATE INDEX IF NOT EXISTS cleaning_jobs_shift_task_idx
  ON public.cleaning_jobs (shift_task_id) WHERE shift_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kitchen_shifts_created_by_user_idx
  ON public.kitchen_shifts (created_by_user_id) WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kitchen_shifts_duty_shift_idx
  ON public.kitchen_shifts (duty_shift_id) WHERE duty_shift_id IS NOT NULL;

DROP POLICY IF EXISTS kitchen_shifts_company_select ON public.kitchen_shifts;
DROP POLICY IF EXISTS kitchen_shifts_admin_write ON public.kitchen_shifts;
DROP POLICY IF EXISTS kitchen_shifts_delivery_self_write ON public.kitchen_shifts;

CREATE POLICY kitchen_shifts_company_select
  ON public.kitchen_shifts FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY kitchen_shifts_admin_insert
  ON public.kitchen_shifts FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
    OR (
      shift_type = 'delivery'
      AND company_id IN (SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

CREATE POLICY kitchen_shifts_admin_update
  ON public.kitchen_shifts FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
    OR (
      shift_type = 'delivery'
      AND company_id IN (SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
    OR (
      shift_type = 'delivery'
      AND company_id IN (SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

CREATE POLICY kitchen_shifts_admin_delete
  ON public.kitchen_shifts FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
    OR (
      shift_type = 'delivery'
      AND company_id IN (SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS staff_shift_tasks_company_select ON public.staff_shift_tasks;
DROP POLICY IF EXISTS staff_shift_tasks_admin_write ON public.staff_shift_tasks;
DROP POLICY IF EXISTS staff_shift_tasks_self_write ON public.staff_shift_tasks;

CREATE POLICY staff_shift_tasks_company_select
  ON public.staff_shift_tasks FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY staff_shift_tasks_write_insert
  ON public.staff_shift_tasks FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
    OR EXISTS (
      SELECT 1 FROM public.kitchen_shifts ks
      WHERE ks.id = staff_shift_tasks.shift_id
        AND ks.staff_id = (SELECT auth.uid())
        AND ks.company_id = staff_shift_tasks.company_id
    )
  );

CREATE POLICY staff_shift_tasks_write_update
  ON public.staff_shift_tasks FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
    OR EXISTS (
      SELECT 1 FROM public.kitchen_shifts ks
      WHERE ks.id = staff_shift_tasks.shift_id
        AND ks.staff_id = (SELECT auth.uid())
        AND ks.company_id = staff_shift_tasks.company_id
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
    OR EXISTS (
      SELECT 1 FROM public.kitchen_shifts ks
      WHERE ks.id = staff_shift_tasks.shift_id
        AND ks.staff_id = (SELECT auth.uid())
        AND ks.company_id = staff_shift_tasks.company_id
    )
  );

CREATE POLICY staff_shift_tasks_write_delete
  ON public.staff_shift_tasks FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
    OR EXISTS (
      SELECT 1 FROM public.kitchen_shifts ks
      WHERE ks.id = staff_shift_tasks.shift_id
        AND ks.staff_id = (SELECT auth.uid())
        AND ks.company_id = staff_shift_tasks.company_id
    )
  );

DROP POLICY IF EXISTS cleaning_jobs_company_select ON public.cleaning_jobs;
DROP POLICY IF EXISTS cleaning_jobs_team_write ON public.cleaning_jobs;

CREATE POLICY cleaning_jobs_company_select
  ON public.cleaning_jobs FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY cleaning_jobs_team_insert
  ON public.cleaning_jobs FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY[
          'company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role,
          'cleaning_staff'::user_role, 'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY cleaning_jobs_team_update
  ON public.cleaning_jobs FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY[
          'company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role,
          'cleaning_staff'::user_role, 'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY[
          'company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role,
          'cleaning_staff'::user_role, 'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY cleaning_jobs_team_delete
  ON public.cleaning_jobs FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY[
          'company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role,
          'cleaning_staff'::user_role, 'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

DROP POLICY IF EXISTS cleaning_machines_company_select ON public.cleaning_machines;
DROP POLICY IF EXISTS cleaning_machines_admin_write ON public.cleaning_machines;

CREATE POLICY cleaning_machines_company_select
  ON public.cleaning_machines FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY cleaning_machines_admin_insert
  ON public.cleaning_machines FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY cleaning_machines_admin_update
  ON public.cleaning_machines FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY cleaning_machines_admin_delete
  ON public.cleaning_machines FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );
