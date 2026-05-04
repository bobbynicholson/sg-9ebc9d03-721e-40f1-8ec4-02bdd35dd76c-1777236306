-- user_departments had RLS enabled but no policies, so every write
-- silently 403'd -- /admin/users "Save Departments" looked like it
-- clicked but never persisted. Add the four policies the page needs:
--   - SELECT: any authenticated user in the same company can read
--     (the page needs to show every staff member's departments).
--   - INSERT/UPDATE/DELETE: company admins manage assignments for
--     users in their tenant.
--   - super_admin bypass for platform support.

DROP POLICY IF EXISTS "user_departments_select_company" ON public.user_departments;
DROP POLICY IF EXISTS "user_departments_admin_write_company" ON public.user_departments;
DROP POLICY IF EXISTS "user_departments_admin_update_company" ON public.user_departments;
DROP POLICY IF EXISTS "user_departments_admin_delete_company" ON public.user_departments;
DROP POLICY IF EXISTS "user_departments_super_admin_all" ON public.user_departments;

CREATE POLICY "user_departments_select_company"
  ON public.user_departments
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.profiles
      WHERE company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "user_departments_admin_write_company"
  ON public.user_departments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_company_admin(auth.uid())
    AND user_id IN (
      SELECT id FROM public.profiles
      WHERE company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "user_departments_admin_update_company"
  ON public.user_departments
  FOR UPDATE
  TO authenticated
  USING (
    is_company_admin(auth.uid())
    AND user_id IN (
      SELECT id FROM public.profiles
      WHERE company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "user_departments_admin_delete_company"
  ON public.user_departments
  FOR DELETE
  TO authenticated
  USING (
    is_company_admin(auth.uid())
    AND user_id IN (
      SELECT id FROM public.profiles
      WHERE company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "user_departments_super_admin_all"
  ON public.user_departments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );
