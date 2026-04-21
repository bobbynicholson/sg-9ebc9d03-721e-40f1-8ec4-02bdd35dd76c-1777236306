-- COMPANIES TABLE POLICIES
DROP POLICY IF EXISTS "super_admin_all_companies" ON public.companies;
CREATE POLICY "super_admin_all_companies" ON public.companies
  FOR ALL USING (user_has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "company_admin_own_company" ON public.companies;
CREATE POLICY "company_admin_own_company" ON public.companies
  FOR SELECT USING (id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "company_admin_update_own" ON public.companies;
CREATE POLICY "company_admin_update_own" ON public.companies
  FOR UPDATE USING (id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- PROFILES TABLE POLICIES
DROP POLICY IF EXISTS "users_own_profile" ON public.profiles;
CREATE POLICY "users_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "company_admin_view_staff" ON public.profiles;
CREATE POLICY "company_admin_view_staff" ON public.profiles
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

DROP POLICY IF EXISTS "company_admin_create_staff" ON public.profiles;
CREATE POLICY "company_admin_create_staff" ON public.profiles
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

DROP POLICY IF EXISTS "company_admin_update_staff" ON public.profiles;
CREATE POLICY "company_admin_update_staff" ON public.profiles
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

DROP POLICY IF EXISTS "super_admin_all_profiles" ON public.profiles;
CREATE POLICY "super_admin_all_profiles" ON public.profiles
  FOR ALL USING (user_has_role(auth.uid(), 'super_admin'));