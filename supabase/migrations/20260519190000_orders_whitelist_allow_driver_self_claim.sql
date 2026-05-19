-- Bug fix: drivers couldn't claim an unassigned order. The
-- enforce_orders_column_whitelist trigger only allowed an
-- assigned_driver_id transition of (self -> NULL) - the release
-- direction. It rejected (NULL -> self) which is what the
-- one-tap self-claim flow does via claim_order().
--
-- Symptom: "orders.update denied: driver may only NULL their own
-- assigned_driver_id" toast on the Available Jobs claim button,
-- even though claim_order is SECURITY DEFINER (the trigger reads
-- auth.uid() directly and still sees the driver role).
--
-- Fix: allow the (NULL -> self) transition for the claim flow.
-- Self-release (self -> NULL) stays allowed. Add driver_id and
-- assigned_at to the whitelist so the same claim UPDATE that
-- writes assigned_driver_id also writes the canonical driver_id
-- + claim timestamp without tripping the column gate.

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
    'pod_photo_url', 'pod_signature_url', 'pod_recipient_name', 'pod_captured_at',
    'driver_acknowledged_at', 'driver_acknowledged_via',
    'assigned_driver_id', 'driver_id', 'assigned_at', 'assignment_score'
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
