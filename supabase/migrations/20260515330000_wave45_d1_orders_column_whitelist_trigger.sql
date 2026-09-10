-- Wave 45 D1 -- defence-in-depth column whitelist on orders UPDATE.
--
-- The audit identified that the existing tenant_isolation_update_orders
-- RLS policy permits ANY company member (driver / kitchen / cleaning /
-- client) to UPDATE ANY column on orders. Latent risk: a driver could
-- overwrite another's assigned_driver_id, change status, edit notes,
-- bump price, etc.
--
-- Approach: keep the loose tenant policy (it's the right answer for
-- tenant scoping). Add a BEFORE UPDATE trigger that:
--
--   1. Always allows admin / company_admin / super_admin / owner.
--   2. Allows drivers to UPDATE only:
--        - rows where THEY are the assigned_driver_id or driver_id
--        - the column whitelist below (status, *_at timestamps,
--          POD fields, driver_acknowledged_*).
--        - assigned_driver_id only when setting to NULL from self
--          (the existing decline pattern).
--   3. Rejects all other non-admin roles (client, kitchen, cleaning,
--      shopping, etc) -- they have no legitimate UPDATE path.
--   4. Service role bypasses entirely (auth.uid() IS NULL).

CREATE OR REPLACE FUNCTION public.enforce_orders_column_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_caller_role  TEXT;
  v_admin_roles  CONSTANT TEXT[] := ARRAY['admin', 'company_admin', 'super_admin', 'owner'];
  v_driver_whitelist CONSTANT TEXT[] := ARRAY[
    'status', 'updated_at',
    'confirmed_at', 'ready_at', 'picked_up_at', 'delivered_at', 'completed_at',
    'pod_photo_url', 'pod_signature_url', 'pod_recipient_name', 'pod_captured_at',
    'driver_acknowledged_at', 'driver_acknowledged_via',
    'assigned_driver_id', 'assignment_score'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role::text INTO v_caller_role FROM public.profiles WHERE id = v_caller;
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

  RAISE EXCEPTION 'orders.update denied: role % has no permitted UPDATE path on orders', v_caller_role;
END;
$$;

DROP TRIGGER IF EXISTS enforce_orders_column_whitelist_trg ON public.orders;
CREATE TRIGGER enforce_orders_column_whitelist_trg
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_orders_column_whitelist();

COMMENT ON FUNCTION public.enforce_orders_column_whitelist IS
  'Wave 45 D1. BEFORE UPDATE trigger: admin-class can write anything, drivers can write a fixed column whitelist on rows assigned to them, all other roles denied. Service role bypasses (auth.uid IS NULL).';
