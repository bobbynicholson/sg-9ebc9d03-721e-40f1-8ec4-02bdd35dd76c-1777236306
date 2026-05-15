-- Wave 45 hotfix -- trigger was blocking the kitchen prep
-- auto-promote-to-ready path.
--
-- kitchenPrepService.checkPrepCompleteForOrder calls
-- updateOrderStatus(orderId, "ready") from a kitchen_staff
-- session whenever the chef ticks off the last prep task. The
-- original trigger denied kitchen_staff entirely because the
-- W45 D1 audit traced kitchen_staff direct .from("orders")
-- writes (none) but missed the indirect path through
-- updateOrderStatus.
--
-- Fix: extend the trigger to allow kitchen_staff (and
-- cleaning_staff for symmetry) to write a NARROW whitelist on
-- orders in their company:
--   - status (drives the prep pipeline)
--   - updated_at, ready_at, confirmed_at, completed_at
--     (timestamps that accompany those flips)
--
-- The key invariant: kitchen_staff cannot touch driver-related
-- columns, financial columns, notes, assigned_chef_id of someone
-- else, etc. Only the prep-progression status + its timestamps.
-- Same row-scope guard as drivers but at company level (not
-- per-row) since prep work is shared across the team.

CREATE OR REPLACE FUNCTION public.enforce_orders_column_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_caller_role  TEXT;
  v_caller_company UUID;
  v_admin_roles  CONSTANT TEXT[] := ARRAY['admin', 'company_admin', 'super_admin', 'owner'];
  v_driver_whitelist CONSTANT TEXT[] := ARRAY[
    'status', 'updated_at',
    'confirmed_at', 'ready_at', 'picked_up_at', 'delivered_at', 'completed_at',
    'pod_photo_url', 'pod_signature_url', 'pod_recipient_name', 'pod_captured_at',
    'driver_acknowledged_at', 'driver_acknowledged_via',
    'assigned_driver_id', 'assignment_score'
  ];
  v_kitchen_whitelist CONSTANT TEXT[] := ARRAY[
    'status', 'updated_at', 'confirmed_at', 'ready_at', 'completed_at'
  ];
BEGIN
  IF v_caller IS NULL THEN
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
    IF NOT (OLD.assigned_driver_id = v_caller OR OLD.driver_id = v_caller) THEN
      RAISE EXCEPTION 'orders.update denied: driver % is not assigned to order %', v_caller, OLD.id;
    END IF;

    IF OLD.assigned_driver_id IS DISTINCT FROM NEW.assigned_driver_id THEN
      IF NOT (OLD.assigned_driver_id = v_caller AND NEW.assigned_driver_id IS NULL) THEN
        RAISE EXCEPTION 'orders.update denied: driver may only NULL their own assigned_driver_id';
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
      RAISE EXCEPTION 'orders.update denied: driver writes restricted to status / *_at / POD / driver_ack columns';
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
$$;
