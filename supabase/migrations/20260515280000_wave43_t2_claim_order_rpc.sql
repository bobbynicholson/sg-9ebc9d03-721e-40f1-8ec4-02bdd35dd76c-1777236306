-- Wave 43 Tier 2 -- driver self-claim of confirmed orders.
--
-- Atomic conditional UPDATE on orders.assigned_driver_id IS NULL,
-- inserts driver_assignments + order_assignment_audit rows in the
-- same transaction. SECURITY DEFINER + explicit caller checks let
-- us bypass the broad orders RLS for this single safe path without
-- loosening the policy.
--
-- Returns json: { ok: bool, reason: text|null, order_id: uuid }
--   ok=false / reason='not_found'        -- order doesn't exist or wrong company
--   ok=false / reason='not_eligible'     -- order isn't confirmed
--   ok=false / reason='already_claimed'  -- another driver beat us
--   ok=false / reason='not_a_driver'     -- caller isn't a driver role
--   ok=true                              -- order is yours
--
-- The conditional UPDATE wins the race natively: a second caller
-- sees 0 rows updated and gets 'already_claimed'.

CREATE OR REPLACE FUNCTION public.claim_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_company UUID;
  v_caller_role TEXT;
  v_order RECORD;
  v_updated_count INT;
BEGIN
  SELECT company_id, role::TEXT INTO v_caller_company, v_caller_role
  FROM public.profiles
  WHERE id = v_caller;
  IF v_caller_company IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF v_caller_role NOT IN ('driver', 'company_admin', 'admin', 'super_admin', 'owner') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_driver');
  END IF;

  SELECT id, company_id, status, assigned_driver_id, event_date
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.company_id != v_caller_company THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.status NOT IN ('confirmed', 'preparing', 'ready') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_eligible');
  END IF;
  IF v_order.assigned_driver_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  UPDATE public.orders
  SET
    assigned_driver_id = v_caller,
    driver_id = v_caller,
    assigned_at = NOW()
  WHERE id = p_order_id
    AND assigned_driver_id IS NULL;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  INSERT INTO public.driver_assignments (
    company_id, order_id, driver_id, status, assigned_at, accepted_at, assignment_type
  ) VALUES (
    v_caller_company, p_order_id, v_caller, 'accepted', NOW(), NOW(), 'delivery'
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.order_assignment_audit (
    company_id, order_id, from_driver_id, to_driver_id, performed_by, reason
  ) VALUES (
    v_caller_company, p_order_id, NULL, v_caller, v_caller, 'Self-claim by driver'
  );

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_order(UUID) TO authenticated;

COMMENT ON FUNCTION public.claim_order(UUID) IS
  'Wave 43 Tier 2. Driver self-claims a confirmed unassigned order. SECURITY DEFINER with explicit company + role + status guards. Returns jsonb {ok, reason?, order_id?}.';
