-- One-off team tasks now include driver routes with an ordered list of stops.
-- Route mutations are transactional so only the assigned driver can advance
-- the route and each step can be recorded once, in order.

ALTER TABLE public.daily_operations_tasks
  DROP CONSTRAINT IF EXISTS daily_operations_task_kind_check,
  ADD CONSTRAINT daily_operations_task_kind_check
    CHECK (task_kind IN (
      'kitchen_cleaning', 'equipment_cleaning', 'custom_kitchen',
      'custom_cleaning', 'custom_both', 'custom_driver'
    )),
  ADD COLUMN IF NOT EXISTS route_stage text,
  ADD COLUMN IF NOT EXISTS route_current_stop_number integer,
  ADD COLUMN IF NOT EXISTS payroll_session_id uuid REFERENCES public.staff_work_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.role_work_sessions
  ADD COLUMN IF NOT EXISTS daily_operation_task_id uuid REFERENCES public.daily_operations_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS role_work_sessions_daily_operation_task_idx
  ON public.role_work_sessions(daily_operation_task_id)
  WHERE daily_operation_task_id IS NOT NULL;

ALTER TABLE public.daily_operations_tasks
  DROP CONSTRAINT IF EXISTS daily_operations_task_route_stage_check,
  DROP CONSTRAINT IF EXISTS daily_operations_task_route_stop_number_check,
  ADD CONSTRAINT daily_operations_task_route_stage_check
    CHECK (route_stage IS NULL OR route_stage IN ('not_started', 'en_route', 'at_stop', 'returning', 'back_at_kitchen')),
  ADD CONSTRAINT daily_operations_task_route_stop_number_check
    CHECK (route_current_stop_number IS NULL OR route_current_stop_number BETWEEN 1 AND 20);

CREATE TABLE IF NOT EXISTS public.daily_operation_driver_task_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.daily_operations_tasks(id) ON DELETE CASCADE,
  stop_number integer NOT NULL CHECK (stop_number BETWEEN 1 AND 20),
  stop_type text NOT NULL CHECK (stop_type IN ('collection', 'delivery', 'other')),
  stop_name text NOT NULL CHECK (length(btrim(stop_name)) BETWEEN 1 AND 140),
  address text NOT NULL CHECK (length(btrim(address)) BETWEEN 1 AND 500),
  instructions text CHECK (instructions IS NULL OR length(instructions) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'en_route', 'arrived', 'completed')),
  on_way_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_operation_driver_task_stops_task_number_key UNIQUE (task_id, stop_number)
);

CREATE INDEX IF NOT EXISTS daily_operation_driver_task_stops_company_task_idx
  ON public.daily_operation_driver_task_stops(company_id, task_id, stop_number);

-- Stored base and department assignments grant access. active_role is only
-- the selected portal and cannot grant a role the account was not assigned.
CREATE OR REPLACE FUNCTION public.is_daily_operations_company_admin(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p_user_id = auth.uid() AND p.id = p_user_id AND p.company_id = p_company_id
      AND p.is_active = true AND p.deleted_at IS NULL
      AND (
        p.role::text IN ('super_admin', 'owner', 'company_admin', 'admin')
        OR EXISTS (
          SELECT 1 FROM public.user_departments ud
          WHERE ud.user_id = p.id
            AND ud.department IN ('super_admin', 'owner', 'company_admin', 'admin')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_daily_operations_role(p_user_id uuid, p_company_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p_user_id = auth.uid() AND p.id = p_user_id AND p.company_id = p_company_id
      AND p.is_active = true AND p.deleted_at IS NULL
      AND (
        p.role::text = ANY(COALESCE(p_roles, ARRAY[]::text[]))
        OR (p.role::text = 'kitchen' AND COALESCE(p_roles, ARRAY[]::text[]) && ARRAY['kitchen_staff', 'kitchen_manager']::text[])
        OR (p.role::text = 'cleaning' AND COALESCE(p_roles, ARRAY[]::text[]) && ARRAY['cleaning_staff', 'cleaning_manager']::text[])
        OR (p.role::text = 'driver_staff' AND 'driver' = ANY(COALESCE(p_roles, ARRAY[]::text[])))
        OR EXISTS (
          SELECT 1 FROM public.user_departments ud
          WHERE ud.user_id = p.id
            AND (
              ud.department = ANY(COALESCE(p_roles, ARRAY[]::text[]))
              OR (ud.department = 'kitchen' AND COALESCE(p_roles, ARRAY[]::text[]) && ARRAY['kitchen_staff', 'kitchen_manager']::text[])
              OR (ud.department = 'cleaning' AND COALESCE(p_roles, ARRAY[]::text[]) && ARRAY['cleaning_staff', 'cleaning_manager']::text[])
              OR (ud.department IN ('driver', 'driver_staff') AND 'driver' = ANY(COALESCE(p_roles, ARRAY[]::text[])))
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_daily_operations_company_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_daily_operations_role(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_daily_operations_company_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_daily_operations_role(uuid, uuid, text[]) TO authenticated;

-- Limit task reads to the teams that can see them and keep row updates on the
-- privileged RPCs below. This also fixes multi-role admins being rejected
-- when their selected portal differs from their base admin role.
DROP POLICY IF EXISTS daily_operations_tasks_select ON public.daily_operations_tasks;
CREATE POLICY daily_operations_tasks_select
  ON public.daily_operations_tasks FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.is_daily_operations_company_admin(auth.uid(), company_id)
      OR assigned_to = auth.uid()
      OR public.user_has_daily_operations_role(
        auth.uid(), company_id,
        CASE WHEN COALESCE(cardinality(visible_roles), 0) > 0 THEN visible_roles ELSE target_roles END
      )
    )
  );

DROP POLICY IF EXISTS daily_operations_tasks_insert ON public.daily_operations_tasks;
CREATE POLICY daily_operations_tasks_insert
  ON public.daily_operations_tasks FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_daily_operations_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS daily_operations_tasks_update ON public.daily_operations_tasks;
CREATE POLICY daily_operations_tasks_update
  ON public.daily_operations_tasks FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_daily_operations_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_daily_operations_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS daily_operations_settings_write ON public.company_daily_operations_settings;
CREATE POLICY daily_operations_settings_write
  ON public.company_daily_operations_settings FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_daily_operations_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_daily_operations_company_admin(auth.uid(), company_id)
  );

ALTER TABLE public.daily_operation_driver_task_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_operation_driver_task_stops_select ON public.daily_operation_driver_task_stops;
CREATE POLICY daily_operation_driver_task_stops_select
  ON public.daily_operation_driver_task_stops FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.daily_operations_tasks task
      WHERE task.id = daily_operation_driver_task_stops.task_id
        AND task.company_id = daily_operation_driver_task_stops.company_id
        AND (
          task.assigned_to = auth.uid()
          OR (
            task.assigned_to IS NULL
            AND public.user_has_daily_operations_role(auth.uid(), task.company_id, ARRAY['driver']::text[])
          )
          OR public.is_daily_operations_company_admin(auth.uid(), task.company_id)
        )
    )
  );

REVOKE ALL ON TABLE public.daily_operation_driver_task_stops FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.daily_operation_driver_task_stops TO authenticated;

CREATE OR REPLACE FUNCTION public.advance_daily_operation_task(
  p_task_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_task public.daily_operations_tasks%ROWTYPE;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before updating this task.';
  END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Your company could not be identified.';
  END IF;

  SELECT * INTO v_task
  FROM public.daily_operations_tasks
  WHERE id = p_task_id AND company_id = v_company_id AND task_kind <> 'custom_driver'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This task could not be found.'; END IF;

  v_is_admin := public.is_daily_operations_company_admin(auth.uid(), v_company_id);
  IF NOT v_is_admin AND NOT public.user_has_daily_operations_role(auth.uid(), v_company_id, v_task.target_roles) THEN
    RAISE EXCEPTION 'This task is visible to you, but it is assigned to another team.';
  END IF;

  IF p_action = 'start' THEN
    IF v_task.status = 'in_progress' AND v_task.assigned_to = auth.uid() THEN
      RETURN v_task.id;
    END IF;
    IF v_task.status <> 'scheduled' OR (v_task.assigned_to IS NOT NULL AND v_task.assigned_to <> auth.uid()) THEN
      RAISE EXCEPTION 'This task has already been claimed or is no longer available.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.daily_operations_tasks other_task
      WHERE other_task.company_id = v_company_id
        AND other_task.assigned_to = auth.uid()
        AND other_task.status = 'in_progress'
        AND other_task.id <> v_task.id
    ) THEN
      RAISE EXCEPTION 'Finish your current timed task before starting another one.';
    END IF;
    UPDATE public.daily_operations_tasks
    SET status = 'in_progress', assigned_to = auth.uid(), started_at = now()
    WHERE id = v_task.id;
    RETURN v_task.id;
  END IF;

  IF p_action = 'complete' THEN
    IF v_task.status <> 'in_progress' OR (v_task.assigned_to IS NOT NULL AND v_task.assigned_to <> auth.uid()) THEN
      RAISE EXCEPTION 'Only the team member who claimed this task can complete it.';
    END IF;
    IF length(COALESCE(p_note, '')) > 2000 THEN
      RAISE EXCEPTION 'Completion notes must be 2000 characters or fewer.';
    END IF;
    UPDATE public.daily_operations_tasks
    SET status = 'completed', assigned_to = COALESCE(assigned_to, auth.uid()),
        completed_at = now(), completed_by = auth.uid(), notes = NULLIF(btrim(COALESCE(p_note, '')), '')
    WHERE id = v_task.id;
    RETURN v_task.id;
  END IF;

  RAISE EXCEPTION 'Choose start or complete for this task.';
END;
$$;

CREATE OR REPLACE FUNCTION public.link_daily_operation_task_payroll_session(
  p_task_id uuid,
  p_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_task public.daily_operations_tasks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before linking a task timer.'; END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  SELECT * INTO v_task
  FROM public.daily_operations_tasks
  WHERE id = p_task_id AND company_id = v_company_id
    AND assigned_to = auth.uid() AND status = 'in_progress'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This task is no longer assigned to you.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_work_sessions session
    WHERE session.id = p_session_id AND session.company_id = v_company_id
      AND session.staff_id = auth.uid() AND session.clock_out IS NULL
      AND session.entry_reason = 'daily_operations_task:' || p_task_id::text
  ) THEN
    RAISE EXCEPTION 'The open payroll timer does not belong to this task.';
  END IF;
  IF v_task.payroll_session_id IS NOT NULL AND v_task.payroll_session_id <> p_session_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_work_sessions previous_session
      WHERE previous_session.id = v_task.payroll_session_id
        AND previous_session.company_id = v_company_id
        AND previous_session.staff_id = auth.uid()
        AND previous_session.clock_out IS NOT NULL
        AND previous_session.entry_reason = 'daily_operations_task:' || p_task_id::text
    ) THEN
      RAISE EXCEPTION 'A different payroll timer is still active for this task.';
    END IF;
  END IF;
  UPDATE public.daily_operations_tasks
  SET payroll_session_id = p_session_id
  WHERE id = v_task.id;
  RETURN v_task.id;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_daily_operation_task(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_daily_operation_task_payroll_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_daily_operation_task(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_daily_operation_task_payroll_session(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_daily_operation_task(
  p_task_kind text,
  p_task_date date,
  p_scheduled_time time,
  p_title text,
  p_description text,
  p_notify_before_hours numeric,
  p_notify_staff boolean,
  p_notify_admins boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_timezone text;
  v_task_id uuid;
  v_roles text[];
  v_visible_roles text[];
  v_shift_types text[];
  v_team_label text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before creating a task.'; END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  IF NOT public.is_daily_operations_company_admin(auth.uid(), v_company_id) THEN
    RAISE EXCEPTION 'Only a company administrator can create a one-off task.';
  END IF;

  CASE p_task_kind
    WHEN 'custom_kitchen' THEN
      v_roles := ARRAY['kitchen_staff', 'kitchen_manager'];
      v_visible_roles := v_roles;
      v_shift_types := ARRAY['kitchen', 'kitchen_and_cleaning'];
      v_team_label := 'kitchen';
    WHEN 'custom_cleaning' THEN
      v_roles := ARRAY['cleaning_staff', 'cleaning_manager'];
      v_visible_roles := ARRAY['kitchen_staff', 'kitchen_manager', 'cleaning_staff', 'cleaning_manager'];
      v_shift_types := ARRAY['cleaning', 'kitchen_and_cleaning'];
      v_team_label := 'cleaning';
    WHEN 'custom_both' THEN
      v_roles := ARRAY['kitchen_staff', 'kitchen_manager', 'cleaning_staff', 'cleaning_manager'];
      v_visible_roles := v_roles;
      v_shift_types := ARRAY['kitchen', 'cleaning', 'kitchen_and_cleaning'];
      v_team_label := 'kitchen or cleaning';
    ELSE
      RAISE EXCEPTION 'Choose a kitchen, cleaning or shared task type.';
  END CASE;

  SELECT COALESCE(NULLIF(c.timezone, ''), 'Africa/Johannesburg') INTO v_timezone
  FROM public.companies c WHERE c.id = v_company_id;
  IF p_task_date IS NULL OR p_scheduled_time IS NULL OR p_task_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'Choose today or a future date for this task.';
  END IF;
  IF length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Enter a task name between 1 and 120 characters.';
  END IF;
  IF length(COALESCE(p_description, '')) > 2000 THEN
    RAISE EXCEPTION 'Task instructions must be 2000 characters or fewer.';
  END IF;
  IF p_notify_before_hours IS NULL OR p_notify_before_hours < 0 OR p_notify_before_hours > 72 THEN
    RAISE EXCEPTION 'Choose a reminder between the task time and 3 days before.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.kitchen_shifts ks
    JOIN public.profiles worker ON worker.id = ks.staff_id
    WHERE ks.company_id = v_company_id AND ks.shift_date = p_task_date
      AND ks.shift_type::text = ANY(v_shift_types)
      AND ks.status IN ('scheduled', 'active') AND ks.deleted_at IS NULL
      AND ks.planned_start IS NOT NULL AND ks.planned_end IS NOT NULL
      AND (
        (ks.planned_end >= ks.planned_start AND p_scheduled_time BETWEEN ks.planned_start AND ks.planned_end)
        OR (ks.planned_end < ks.planned_start AND (p_scheduled_time >= ks.planned_start OR p_scheduled_time <= ks.planned_end))
      )
      AND worker.company_id = v_company_id AND worker.is_active = true AND worker.deleted_at IS NULL
      AND (
        (
          ks.shift_type::text IN ('kitchen', 'kitchen_and_cleaning')
          AND (
            worker.role::text IN ('kitchen', 'kitchen_staff', 'kitchen_manager')
            OR EXISTS (
              SELECT 1 FROM public.user_departments ud
              WHERE ud.user_id = worker.id
                AND ud.department IN ('kitchen', 'kitchen_staff', 'kitchen_manager')
            )
          )
        )
        OR (
          ks.shift_type::text IN ('cleaning', 'kitchen_and_cleaning')
          AND (
            worker.role::text IN ('cleaning', 'cleaning_staff', 'cleaning_manager')
            OR EXISTS (
              SELECT 1 FROM public.user_departments ud
              WHERE ud.user_id = worker.id
                AND ud.department IN ('cleaning', 'cleaning_staff', 'cleaning_manager')
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Nobody from the % team is rostered at this date and time. Nothing was created; add a matching shift or choose a time when the team is working.', v_team_label;
  END IF;

  INSERT INTO public.daily_operations_tasks (
    company_id, task_kind, task_date, scheduled_time, title, description,
    target_roles, visible_roles, status, assigned_to, notify_before_hours,
    notify_staff, notify_admins
  ) VALUES (
    v_company_id, p_task_kind, p_task_date, p_scheduled_time, btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''), v_roles, v_visible_roles,
    'scheduled', NULL, p_notify_before_hours, COALESCE(p_notify_staff, true), COALESCE(p_notify_admins, true)
  ) RETURNING id INTO v_task_id;
  RETURN v_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_daily_operation_task(text, date, time, text, text, numeric, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_daily_operation_task(text, date, time, text, text, numeric, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_daily_operation_driver_task(
  p_task_date date,
  p_scheduled_time time,
  p_title text,
  p_description text,
  p_notify_before_hours numeric,
  p_notify_staff boolean,
  p_notify_admins boolean,
  p_stops jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_timezone text;
  v_task_id uuid;
  v_item record;
  v_stop_type text;
  v_stop_name text;
  v_address text;
  v_instructions text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before creating a driver route.';
  END IF;

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active = true
    AND p.deleted_at IS NULL
    AND (
      p.role::text IN ('super_admin', 'owner', 'company_admin', 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_departments ud
        WHERE ud.user_id = p.id
          AND ud.department IN ('super_admin', 'owner', 'company_admin', 'admin')
      )
    );
  v_company_id := COALESCE(v_company_id, public.get_user_company_id(auth.uid()));

  IF v_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = v_company_id
      AND p.is_active = true
      AND p.deleted_at IS NULL
      AND (
        p.role::text IN ('super_admin', 'owner', 'company_admin', 'admin')
        OR EXISTS (
          SELECT 1 FROM public.user_departments ud
          WHERE ud.user_id = p.id
            AND ud.department IN ('super_admin', 'owner', 'company_admin', 'admin')
        )
      )
  ) THEN
    RAISE EXCEPTION 'Only a company administrator can create a driver route.';
  END IF;

  SELECT COALESCE(NULLIF(c.timezone, ''), 'Africa/Johannesburg') INTO v_timezone
  FROM public.companies c WHERE c.id = v_company_id;

  IF p_task_date IS NULL OR p_scheduled_time IS NULL OR p_task_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'Choose today or a future date for this route.';
  END IF;
  IF length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Enter a route name between 1 and 120 characters.';
  END IF;
  IF length(COALESCE(p_description, '')) > 2000 THEN
    RAISE EXCEPTION 'Route instructions must be 2000 characters or fewer.';
  END IF;
  IF p_notify_before_hours IS NULL OR p_notify_before_hours < 0 OR p_notify_before_hours > 72 THEN
    RAISE EXCEPTION 'Choose a reminder between the task time and 3 days before.';
  END IF;
  IF jsonb_typeof(p_stops) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Add between 1 and 20 route stops.';
  END IF;
  IF jsonb_array_length(p_stops) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Add between 1 and 20 route stops.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.kitchen_shifts ks
    JOIN public.profiles driver ON driver.id = ks.staff_id
    WHERE ks.company_id = v_company_id
      AND ks.shift_date = p_task_date
      AND ks.shift_type = 'delivery'
      AND ks.status IN ('scheduled', 'active')
      AND ks.deleted_at IS NULL
      AND ks.planned_start IS NOT NULL
      AND ks.planned_end IS NOT NULL
      AND (
        (ks.planned_end >= ks.planned_start AND p_scheduled_time BETWEEN ks.planned_start AND ks.planned_end)
        OR (ks.planned_end < ks.planned_start AND (p_scheduled_time >= ks.planned_start OR p_scheduled_time <= ks.planned_end))
      )
      AND driver.company_id = v_company_id
      AND driver.is_active = true
      AND driver.deleted_at IS NULL
      AND (
        driver.role::text IN ('driver', 'driver_staff')
        OR EXISTS (
          SELECT 1 FROM public.user_departments ud
          WHERE ud.user_id = driver.id
            AND ud.department IN ('driver', 'driver_staff')
        )
      )
  ) THEN
    RAISE EXCEPTION 'No driver is scheduled at this time. Nothing was created; add a driver shift or choose a time when a driver is working.';
  END IF;

  INSERT INTO public.daily_operations_tasks (
    company_id, task_kind, task_date, scheduled_time, title, description,
    target_roles, visible_roles, status, assigned_to, notify_before_hours,
    notify_staff, notify_admins, route_stage
  ) VALUES (
    v_company_id, 'custom_driver', p_task_date, p_scheduled_time, btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''), ARRAY['driver'], ARRAY['driver'],
    'scheduled', NULL, p_notify_before_hours, COALESCE(p_notify_staff, true),
    COALESCE(p_notify_admins, true), 'not_started'
  ) RETURNING id INTO v_task_id;

  FOR v_item IN SELECT value, ordinality FROM jsonb_array_elements(p_stops) WITH ORDINALITY
  LOOP
    v_stop_type := COALESCE(v_item.value->>'stop_type', '');
    v_stop_name := btrim(COALESCE(v_item.value->>'stop_name', ''));
    v_address := btrim(COALESCE(v_item.value->>'address', ''));
    v_instructions := NULLIF(btrim(COALESCE(v_item.value->>'instructions', '')), '');

    IF v_stop_type NOT IN ('collection', 'delivery', 'other') THEN
      RAISE EXCEPTION 'Stop % has an invalid stop type.', v_item.ordinality;
    END IF;
    IF length(v_stop_name) NOT BETWEEN 1 AND 140 THEN
      RAISE EXCEPTION 'Enter a name of 1 to 140 characters for stop %.', v_item.ordinality;
    END IF;
    IF length(v_address) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Enter an address of 1 to 500 characters for stop %.', v_item.ordinality;
    END IF;
    IF length(COALESCE(v_instructions, '')) > 1000 THEN
      RAISE EXCEPTION 'Stop instructions must be 1000 characters or fewer.';
    END IF;

    INSERT INTO public.daily_operation_driver_task_stops (
      company_id, task_id, stop_number, stop_type, stop_name, address, instructions
    ) VALUES (
      v_company_id, v_task_id, v_item.ordinality::integer, v_stop_type,
      v_stop_name, v_address, v_instructions
    );
  END LOOP;

  RETURN v_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_daily_operation_driver_task(
  p_task_id uuid,
  p_action text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_task public.daily_operations_tasks%ROWTYPE;
  v_is_admin boolean;
  v_is_driver boolean;
  v_stop public.daily_operation_driver_task_stops%ROWTYPE;
  v_next_stop public.daily_operation_driver_task_stops%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before updating a driver route.';
  END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Your company could not be identified.';
  END IF;

  v_is_admin := public.is_daily_operations_company_admin(auth.uid(), v_company_id);
  v_is_driver := public.user_has_daily_operations_role(auth.uid(), v_company_id, ARRAY['driver']::text[]);

  SELECT * INTO v_task
  FROM public.daily_operations_tasks
  WHERE id = p_task_id AND company_id = v_company_id AND task_kind = 'custom_driver'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This driver route could not be found.'; END IF;
  IF NOT v_is_admin AND NOT v_is_driver THEN
    RAISE EXCEPTION 'Only a driver assigned to this company can update this route.';
  END IF;

  IF p_action = 'start' THEN
    IF v_task.status = 'in_progress' AND v_task.assigned_to = auth.uid() AND v_task.route_stage = 'en_route' THEN
      RETURN v_task.id;
    END IF;
    IF v_task.status <> 'scheduled' OR (v_task.assigned_to IS NOT NULL AND v_task.assigned_to <> auth.uid()) THEN
      RAISE EXCEPTION 'This route has already been claimed or is no longer available.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.daily_operations_tasks other_task
      WHERE other_task.company_id = v_company_id
        AND other_task.assigned_to = auth.uid()
        AND other_task.status = 'in_progress'
        AND other_task.id <> v_task.id
    ) THEN
      RAISE EXCEPTION 'Finish your current timed task before starting another route.';
    END IF;
    IF NOT v_is_admin AND NOT EXISTS (
      SELECT 1
      FROM public.kitchen_shifts ks
      WHERE ks.company_id = v_company_id
        AND ks.staff_id = auth.uid()
        AND ks.shift_date = v_task.task_date
        AND ks.shift_type = 'delivery'
        AND ks.status IN ('scheduled', 'active')
        AND ks.deleted_at IS NULL
        AND ks.planned_start IS NOT NULL
        AND ks.planned_end IS NOT NULL
        AND (
          (ks.planned_end >= ks.planned_start AND v_task.scheduled_time BETWEEN ks.planned_start AND ks.planned_end)
          OR (ks.planned_end < ks.planned_start AND (v_task.scheduled_time >= ks.planned_start OR v_task.scheduled_time <= ks.planned_end))
        )
    ) THEN
      RAISE EXCEPTION 'You are not rostered for this route time. Ask a manager to check the driver schedule.';
    END IF;

    SELECT * INTO v_stop FROM public.daily_operation_driver_task_stops
    WHERE task_id = v_task.id AND company_id = v_company_id AND stop_number = 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'This route has no stops. Ask a manager to edit the task.'; END IF;

    UPDATE public.daily_operations_tasks
    SET status = 'in_progress', assigned_to = auth.uid(), started_at = now(), route_stage = 'en_route', route_current_stop_number = 1
    WHERE id = v_task.id;
    UPDATE public.daily_operation_driver_task_stops SET status = 'en_route', on_way_at = now()
    WHERE id = v_stop.id;
    RETURN v_task.id;
  END IF;

  IF v_task.status <> 'in_progress' OR (v_task.assigned_to <> auth.uid() AND NOT v_is_admin) THEN
    RAISE EXCEPTION 'Only the driver who claimed this route can advance it.';
  END IF;

  IF p_action = 'arrive' AND v_task.route_stage = 'en_route' AND v_task.route_current_stop_number IS NOT NULL THEN
    UPDATE public.daily_operation_driver_task_stops
    SET status = 'arrived', arrived_at = now()
    WHERE task_id = v_task.id AND company_id = v_company_id
      AND stop_number = v_task.route_current_stop_number AND status = 'en_route';
    IF NOT FOUND THEN RAISE EXCEPTION 'The current stop is not marked as on the way.'; END IF;
    UPDATE public.daily_operations_tasks SET route_stage = 'at_stop' WHERE id = v_task.id;
    RETURN v_task.id;
  END IF;

  IF p_action = 'complete_stop' AND v_task.route_stage = 'at_stop' AND v_task.route_current_stop_number IS NOT NULL THEN
    UPDATE public.daily_operation_driver_task_stops
    SET status = 'completed', completed_at = now()
    WHERE task_id = v_task.id AND company_id = v_company_id
      AND stop_number = v_task.route_current_stop_number AND status = 'arrived';
    IF NOT FOUND THEN RAISE EXCEPTION 'Arrive at the current stop before completing it.'; END IF;
    SELECT * INTO v_next_stop FROM public.daily_operation_driver_task_stops
    WHERE task_id = v_task.id AND company_id = v_company_id
      AND stop_number = v_task.route_current_stop_number + 1;
    IF FOUND THEN
      UPDATE public.daily_operation_driver_task_stops
      SET status = 'en_route', on_way_at = now()
      WHERE id = v_next_stop.id;
      UPDATE public.daily_operations_tasks
      SET route_stage = 'en_route', route_current_stop_number = v_next_stop.stop_number
      WHERE id = v_task.id;
    ELSE
      UPDATE public.daily_operations_tasks
      SET route_stage = 'returning', route_current_stop_number = NULL
      WHERE id = v_task.id;
    END IF;
    RETURN v_task.id;
  END IF;

  IF p_action = 'back_at_kitchen' AND v_task.route_stage = 'returning' THEN
    UPDATE public.daily_operations_tasks
    SET status = 'completed', completed_at = now(), completed_by = auth.uid(), route_stage = 'back_at_kitchen', route_current_stop_number = NULL
    WHERE id = v_task.id;
    RETURN v_task.id;
  END IF;

  RAISE EXCEPTION 'That route step is out of order. Refresh the page and continue from the current stop.';
END;
$$;

REVOKE ALL ON FUNCTION public.create_daily_operation_driver_task(date, time, text, text, numeric, boolean, boolean, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advance_daily_operation_driver_task(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_daily_operation_driver_task(date, time, text, text, numeric, boolean, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_daily_operation_driver_task(uuid, text) TO authenticated;

COMMENT ON TABLE public.daily_operation_driver_task_stops IS
  'Ordered collection and delivery stops attached to a one-off driver task. Each transition is written by advance_daily_operation_driver_task.';
COMMENT ON COLUMN public.daily_operations_tasks.payroll_session_id IS
  'Optional staff-hours payroll session opened solely for this task when the worker did not already have an open paid shift.';
