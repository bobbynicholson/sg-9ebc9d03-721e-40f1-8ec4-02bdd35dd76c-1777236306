-- DRIVER-SPECIFIC POLICIES
DROP POLICY IF EXISTS "driver_own_assignments" ON public.driver_assignments;
CREATE POLICY "driver_own_assignments" ON public.driver_assignments
  FOR SELECT USING (driver_id = auth.uid() OR company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "driver_update_assignments" ON public.driver_assignments;
CREATE POLICY "driver_update_assignments" ON public.driver_assignments
  FOR UPDATE USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "driver_own_routes" ON public.optimized_routes;
CREATE POLICY "driver_own_routes" ON public.optimized_routes
  FOR SELECT USING (driver_id = auth.uid() OR company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "driver_log_gps" ON public.gps_tracking_logs;
CREATE POLICY "driver_log_gps" ON public.gps_tracking_logs
  FOR INSERT WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "driver_view_gps" ON public.gps_tracking_logs;
CREATE POLICY "driver_view_gps" ON public.gps_tracking_logs
  FOR SELECT USING (driver_id = auth.uid());

-- KITCHEN STAFF POLICIES
DROP POLICY IF EXISTS "kitchen_view_prep_lists" ON public.prep_lists;
CREATE POLICY "kitchen_view_prep_lists" ON public.prep_lists
  FOR SELECT USING (assigned_to = auth.uid() OR company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "kitchen_update_prep_lists" ON public.prep_lists;
CREATE POLICY "kitchen_update_prep_lists" ON public.prep_lists
  FOR UPDATE USING (assigned_to = auth.uid() OR company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "kitchen_view_duties" ON public.kitchen_duties;
CREATE POLICY "kitchen_view_duties" ON public.kitchen_duties
  FOR SELECT USING (staff_id = auth.uid() OR company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "kitchen_update_duties" ON public.kitchen_duties;
CREATE POLICY "kitchen_update_duties" ON public.kitchen_duties
  FOR UPDATE USING (staff_id = auth.uid());

-- NOTIFICATIONS POLICIES
DROP POLICY IF EXISTS "user_own_notifications" ON public.notifications;
CREATE POLICY "user_own_notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_update_notifications" ON public.notifications;
CREATE POLICY "user_update_notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "system_create_notifications" ON public.notifications;
CREATE POLICY "system_create_notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- DELIVERY FEEDBACK POLICIES
DROP POLICY IF EXISTS "client_own_feedback" ON public.delivery_feedback;
CREATE POLICY "client_own_feedback" ON public.delivery_feedback
  FOR SELECT USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR company_id = get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "client_submit_feedback" ON public.delivery_feedback;
CREATE POLICY "client_submit_feedback" ON public.delivery_feedback
  FOR INSERT WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));