-- Manager role follow-up:
--   1. centralize "current user has role" for policies so profiles.role
--      and user_departments.department both count;
--   2. grant kitchen / cleaning managers write access to their domain
--      policies without broadening finance/admin surfaces.

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT
      p.id,
      p.role::text AS profile_role,
      p.active_role::text AS active_role
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
  ),
  department_roles AS (
    SELECT
      CASE
        WHEN ud.department = 'kitchen' THEN
          CASE WHEN c.profile_role = 'kitchen_manager' OR c.active_role = 'kitchen_manager' THEN 'kitchen_manager' ELSE 'kitchen_staff' END
        WHEN ud.department = 'cleaning' THEN
          CASE WHEN c.profile_role = 'cleaning_manager' OR c.active_role = 'cleaning_manager' THEN 'cleaning_manager' ELSE 'cleaning_staff' END
        WHEN ud.department IN ('shopping', 'buyer') THEN 'shopping_staff'
        WHEN ud.department IN ('waitering', 'server') THEN 'waiter'
        ELSE ud.department
      END AS role_name
    FROM public.user_departments ud
    JOIN caller c ON c.id = ud.user_id
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM caller c
      WHERE c.profile_role = ANY(required_roles)
         OR c.active_role = ANY(required_roles)
    )
    OR EXISTS (
      SELECT 1
      FROM department_roles dr
      WHERE dr.role_name = ANY(required_roles)
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_has_any_role(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_any_role(text[]) TO authenticated, service_role;

-- Kitchen shift planning: kitchen managers can own the roster in their domain.
DROP POLICY IF EXISTS kitchen_shifts_admin_write ON public.kitchen_shifts;
DROP POLICY IF EXISTS kitchen_shifts_admin_insert ON public.kitchen_shifts;
DROP POLICY IF EXISTS kitchen_shifts_admin_update ON public.kitchen_shifts;
DROP POLICY IF EXISTS kitchen_shifts_admin_delete ON public.kitchen_shifts;

CREATE POLICY kitchen_shifts_admin_insert
  ON public.kitchen_shifts FOR INSERT
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'kitchen_manager'
      ])
    )
    OR (
      shift_type = 'delivery'
      AND company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  );

CREATE POLICY kitchen_shifts_admin_update
  ON public.kitchen_shifts FOR UPDATE
  USING (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'kitchen_manager'
      ])
    )
    OR (
      shift_type = 'delivery'
      AND company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'kitchen_manager'
      ])
    )
    OR (
      shift_type = 'delivery'
      AND company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  );

CREATE POLICY kitchen_shifts_admin_delete
  ON public.kitchen_shifts FOR DELETE
  USING (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'kitchen_manager'
      ])
    )
    OR (
      shift_type = 'delivery'
      AND company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  );

-- Per-shift task assignment: kitchen and cleaning managers can assign work.
DROP POLICY IF EXISTS staff_shift_tasks_admin_write ON public.staff_shift_tasks;
DROP POLICY IF EXISTS staff_shift_tasks_write_insert ON public.staff_shift_tasks;
DROP POLICY IF EXISTS staff_shift_tasks_write_update ON public.staff_shift_tasks;
DROP POLICY IF EXISTS staff_shift_tasks_write_delete ON public.staff_shift_tasks;

CREATE POLICY staff_shift_tasks_write_insert
  ON public.staff_shift_tasks FOR INSERT
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'kitchen_manager', 'cleaning_manager'
      ])
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
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'kitchen_manager', 'cleaning_manager'
      ])
    )
    OR EXISTS (
      SELECT 1 FROM public.kitchen_shifts ks
      WHERE ks.id = staff_shift_tasks.shift_id
        AND ks.staff_id = (SELECT auth.uid())
        AND ks.company_id = staff_shift_tasks.company_id
    )
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'kitchen_manager', 'cleaning_manager'
      ])
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
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'kitchen_manager', 'cleaning_manager'
      ])
    )
    OR EXISTS (
      SELECT 1 FROM public.kitchen_shifts ks
      WHERE ks.id = staff_shift_tasks.shift_id
        AND ks.staff_id = (SELECT auth.uid())
        AND ks.company_id = staff_shift_tasks.company_id
    )
  );

-- Cleaning domain writes: cleaning manager owns cleaning tooling; kitchen
-- manager keeps the existing cross-team cleaning dashboard write path.
DROP POLICY IF EXISTS cleaning_jobs_team_insert ON public.cleaning_jobs;
DROP POLICY IF EXISTS cleaning_jobs_team_update ON public.cleaning_jobs;
DROP POLICY IF EXISTS cleaning_jobs_team_delete ON public.cleaning_jobs;

CREATE POLICY cleaning_jobs_team_insert
  ON public.cleaning_jobs FOR INSERT
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin',
        'cleaning_manager', 'cleaning_staff',
        'kitchen_manager', 'kitchen_staff'
      ])
    )
  );

CREATE POLICY cleaning_jobs_team_update
  ON public.cleaning_jobs FOR UPDATE
  USING (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin',
        'cleaning_manager', 'cleaning_staff',
        'kitchen_manager', 'kitchen_staff'
      ])
    )
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin',
        'cleaning_manager', 'cleaning_staff',
        'kitchen_manager', 'kitchen_staff'
      ])
    )
  );

CREATE POLICY cleaning_jobs_team_delete
  ON public.cleaning_jobs FOR DELETE
  USING (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin',
        'cleaning_manager', 'cleaning_staff',
        'kitchen_manager', 'kitchen_staff'
      ])
    )
  );

DROP POLICY IF EXISTS cleaning_event_checklists_team_write ON public.cleaning_event_checklists;
CREATE POLICY cleaning_event_checklists_team_write
  ON public.cleaning_event_checklists FOR ALL
  USING (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin',
        'cleaning_manager', 'cleaning_staff',
        'kitchen_manager', 'kitchen_staff'
      ])
    )
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin',
        'cleaning_manager', 'cleaning_staff',
        'kitchen_manager', 'kitchen_staff'
      ])
    )
  );

DROP POLICY IF EXISTS cleaning_machines_admin_write ON public.cleaning_machines;
DROP POLICY IF EXISTS cleaning_machines_admin_insert ON public.cleaning_machines;
DROP POLICY IF EXISTS cleaning_machines_admin_update ON public.cleaning_machines;
DROP POLICY IF EXISTS cleaning_machines_admin_delete ON public.cleaning_machines;

CREATE POLICY cleaning_machines_admin_insert
  ON public.cleaning_machines FOR INSERT
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'cleaning_manager'
      ])
    )
  );

CREATE POLICY cleaning_machines_admin_update
  ON public.cleaning_machines FOR UPDATE
  USING (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'cleaning_manager'
      ])
    )
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'cleaning_manager'
      ])
    )
  );

CREATE POLICY cleaning_machines_admin_delete
  ON public.cleaning_machines FOR DELETE
  USING (
    public.current_user_has_any_role(ARRAY['super_admin'])
    OR (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.current_user_has_any_role(ARRAY[
        'company_admin', 'owner', 'admin', 'super_admin', 'cleaning_manager'
      ])
    )
  );
