-- Manager roles: department picker compatibility + cleaning team writes.

ALTER TABLE public.user_departments
  DROP CONSTRAINT IF EXISTS user_departments_department_check;

ALTER TABLE public.user_departments
  ADD CONSTRAINT user_departments_department_check
  CHECK (department IN (
    'admin', 'company_admin', 'owner', 'region_admin', 'sales_admin', 'super_admin',
    'kitchen', 'kitchen_staff', 'kitchen_manager',
    'shopping', 'shopping_staff', 'buyer',
    'driver', 'waiter',
    'cleaning', 'cleaning_staff', 'cleaning_manager',
    'client', 'outsource'
  ));

DROP POLICY IF EXISTS cleaning_jobs_team_insert ON public.cleaning_jobs;
CREATE POLICY cleaning_jobs_team_insert
  ON public.cleaning_jobs FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY[
          'company_admin'::user_role, 'owner'::user_role, 'admin'::user_role, 'super_admin'::user_role,
          'cleaning_manager'::user_role, 'cleaning_staff'::user_role,
          'kitchen_manager'::user_role, 'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

DROP POLICY IF EXISTS cleaning_jobs_team_update ON public.cleaning_jobs;
CREATE POLICY cleaning_jobs_team_update
  ON public.cleaning_jobs FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY[
          'company_admin'::user_role, 'owner'::user_role, 'admin'::user_role, 'super_admin'::user_role,
          'cleaning_manager'::user_role, 'cleaning_staff'::user_role,
          'kitchen_manager'::user_role, 'kitchen_staff'::user_role
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
          'company_admin'::user_role, 'owner'::user_role, 'admin'::user_role, 'super_admin'::user_role,
          'cleaning_manager'::user_role, 'cleaning_staff'::user_role,
          'kitchen_manager'::user_role, 'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );

DROP POLICY IF EXISTS cleaning_jobs_team_delete ON public.cleaning_jobs;
CREATE POLICY cleaning_jobs_team_delete
  ON public.cleaning_jobs FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = ANY (ARRAY[
          'company_admin'::user_role, 'owner'::user_role, 'admin'::user_role, 'super_admin'::user_role,
          'cleaning_manager'::user_role, 'cleaning_staff'::user_role,
          'kitchen_manager'::user_role, 'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin'::user_role
    )
  );
