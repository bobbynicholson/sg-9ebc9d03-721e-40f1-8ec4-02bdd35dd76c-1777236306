-- Let the waiter / collection-trip stamp triggers write their three
-- event-day timestamps on orders.
--
-- enforce_orders_column_whitelist (BEFORE UPDATE on orders) checks the
-- tapping user via auth.uid(), even inside SECURITY DEFINER triggers.
-- Waiters have no UPDATE path at all, and a collection driver is rejected
-- when dispatch gave the collection to someone other than the order's
-- assigned driver - in both cases the exception would abort the waiter's
-- "Service started" tap or the driver's "Equipment collected" tap.
--
-- Adds a narrow trusted-stamp path: when app.trusted_order_stamp = 'on'
-- (set transaction-locally by those two trigger functions only) and the
-- update touches nothing but service_started_at / service_ended_at /
-- event_complete_at / updated_at, the row passes. Every other rule is
-- unchanged from 20260704090000.
--
-- Idempotent - safe to run repeatedly.

CREATE OR REPLACE FUNCTION public.enforce_orders_column_whitelist()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller       UUID := auth.uid();
  v_caller_role  TEXT;
  v_caller_company UUID;
  v_admin_roles  CONSTANT TEXT[] := ARRAY['admin', 'company_admin', 'super_admin', 'owner'];
  v_driver_whitelist CONSTANT TEXT[] := ARRAY[
    'status', 'updated_at',
    'confirmed_at', 'ready_at', 'picked_up_at', 'delivered_at', 'completed_at',
    'arrived_at_venue_at', 'setup_started_at', 'service_started_at',
    'departed_venue_at', 'service_ended_at', 'event_complete_at',
    'pod_photo_url', 'pod_signature_url', 'pod_recipient_name', 'pod_captured_at',
    'driver_acknowledged_at', 'driver_acknowledged_via',
    'assigned_driver_id', 'driver_id', 'assigned_at', 'assignment_score'
  ];
  -- Columns a trusted stamp trigger may set for any caller (see below).
  v_trusted_stamp_cols CONSTANT TEXT[] := ARRAY[
    'service_started_at', 'service_ended_at', 'event_complete_at', 'updated_at'
  ];
  v_kitchen_whitelist CONSTANT TEXT[] := ARRAY[
    'status', 'updated_at', 'confirmed_at', 'ready_at', 'completed_at'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Trusted event-day stamps. stamp_order_service_started_from_attendance
  -- (waiter's "Service started") and stamp_order_event_end_from_collection
  -- (collection trip "Equipment collected" / "back at base") run as the
  -- tapping waiter / driver, who have no (or only an assigned-order) write
  -- path here. They set app.trusted_order_stamp for their own UPDATE only.
  -- The flag cannot be set from the API (set_config is not exposed), and
  -- even with it only the three event-day timestamps may change.
  IF current_setting('app.trusted_order_stamp', true) = 'on'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_each(to_jsonb(OLD)) AS o(key, value)
       JOIN jsonb_each(to_jsonb(NEW)) AS n USING (key)
       WHERE o.value IS DISTINCT FROM n.value
         AND NOT (o.key = ANY (v_trusted_stamp_cols))
     ) THEN
    RETURN NEW;
  END IF;

  SELECT role::text, company_id INTO v_caller_role, v_caller_company
  FROM public.profiles WHERE id = v_caller;
  IF v_caller_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_caller_role = ANY (v_admin_roles)
     OR v_caller_role IN ('admin', 'company_admin', 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF v_caller_role = 'driver' THEN
    -- Allow the self-claim case (NULL -> self) up front so the
    -- "must already be assigned" guard below doesn't reject it.
    IF NOT (
      OLD.assigned_driver_id = v_caller
      OR OLD.driver_id = v_caller
      OR (OLD.assigned_driver_id IS NULL AND NEW.assigned_driver_id = v_caller)
    ) THEN
      RAISE EXCEPTION 'orders.update denied: driver % is not assigned to order %', v_caller, OLD.id;
    END IF;

    -- assigned_driver_id transitions:
    --   self -> NULL  (release)
    --   NULL -> self  (claim)
    -- anything else is rejected.
    IF OLD.assigned_driver_id IS DISTINCT FROM NEW.assigned_driver_id THEN
      IF NOT (
        (OLD.assigned_driver_id = v_caller AND NEW.assigned_driver_id IS NULL)
        OR (OLD.assigned_driver_id IS NULL AND NEW.assigned_driver_id = v_caller)
      ) THEN
        RAISE EXCEPTION 'orders.update denied: driver may only claim (NULL to self) or release (self to NULL) their own assigned_driver_id';
      END IF;
    END IF;

    IF OLD.assignment_score IS DISTINCT FROM NEW.assignment_score
       AND NEW.assignment_score IS NOT NULL THEN
      RAISE EXCEPTION 'orders.update denied: driver may only NULL assignment_score';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_each(to_jsonb(OLD)) AS o(key, value)
      JOIN jsonb_each(to_jsonb(NEW)) AS n USING (key)
      WHERE o.value IS DISTINCT FROM n.value
        AND NOT (o.key = ANY (v_driver_whitelist))
    ) THEN
      RAISE EXCEPTION 'orders.update denied: driver writes restricted to status / *_at / POD / driver_ack / assignment columns';
    END IF;

    RETURN NEW;
  END IF;

  IF v_caller_role = 'kitchen_staff' OR v_caller_role = 'cleaning_staff' THEN
    IF v_caller_company IS NULL OR OLD.company_id IS DISTINCT FROM v_caller_company THEN
      RAISE EXCEPTION 'orders.update denied: % cannot write outside own company', v_caller_role;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_each(to_jsonb(OLD)) AS o(key, value)
      JOIN jsonb_each(to_jsonb(NEW)) AS n USING (key)
      WHERE o.value IS DISTINCT FROM n.value
        AND NOT (o.key = ANY (v_kitchen_whitelist))
    ) THEN
      RAISE EXCEPTION 'orders.update denied: % writes restricted to status + status timestamps', v_caller_role;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'orders.update denied: role % has no permitted UPDATE path on orders', v_caller_role;
END;
$function$;
