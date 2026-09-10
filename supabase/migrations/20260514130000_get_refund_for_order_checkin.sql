-- Wave 17 audit: get_refund_for_order existed in production from a
-- hand-applied SQL change but had no checked-in migration -- the
-- function the cancellation/postponement flow depends on wasn't
-- reproducible from the migrations folder. Check it in here so a
-- fresh database build matches prod and there's a single
-- source-of-truth for the refund-tier policy logic.
--
-- Function logic walks companies.cancellation_policy.deposit_refund_tiers
-- (sorted descending by min_days_before_event), picks the highest-refund
-- tier the order still satisfies, and returns the refund amount the
-- client is owed. Falls back to companies.cancellation_fee_percent when
-- no tiers are configured so tenants who only touched the simple
-- Settings -> Financial card don't silently forfeit every deposit.
--
-- SECURITY DEFINER + revoked PUBLIC EXEC -- only callers via the
-- API routes (which run service-role) can invoke it.

CREATE OR REPLACE FUNCTION public.get_refund_for_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order             public.orders%ROWTYPE;
  v_policy            jsonb;
  v_days_to_event     integer;
  v_tier              jsonb;
  v_refund_pct        numeric := 0;
  v_tier_label        text := 'forfeit';
  v_deposit_paid      numeric;
  v_amount_paid       numeric;
  v_refund_amount     numeric := 0;
  v_can_postpone      boolean;
  v_postpone_notice   integer;
  v_late_override     integer;
  v_requires_override boolean;
  v_tier_count        integer := 0;
  v_cancel_fee_pct    numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'order_not_found');
  END IF;

  SELECT cancellation_policy, cancellation_fee_percent
    INTO v_policy, v_cancel_fee_pct
  FROM public.companies WHERE id = v_order.company_id;
  IF v_policy IS NULL THEN
    v_policy := '{}'::jsonb;
  END IF;

  v_days_to_event := GREATEST(0, (v_order.event_date - CURRENT_DATE)::integer);
  v_postpone_notice := COALESCE((v_policy->>'postponement_notice_days')::integer, 14);
  v_late_override := COALESCE((v_policy->>'late_cancel_requires_owner_override_days')::integer, 3);

  FOR v_tier IN
    SELECT * FROM jsonb_array_elements(COALESCE(v_policy->'deposit_refund_tiers', '[]'::jsonb))
    ORDER BY (value->>'min_days_before_event')::integer DESC
  LOOP
    v_tier_count := v_tier_count + 1;
    IF v_days_to_event >= (v_tier->>'min_days_before_event')::integer THEN
      v_refund_pct := (v_tier->>'refund_pct')::numeric;
      v_tier_label := CASE
        WHEN v_refund_pct = 0   THEN 'forfeit'
        WHEN v_refund_pct < 50  THEN 'partial'
        WHEN v_refund_pct < 100 THEN 'most'
        ELSE 'full'
      END;
      EXIT;
    END IF;
  END LOOP;

  IF v_tier_count = 0 THEN
    v_refund_pct := GREATEST(0, 100 - COALESCE(v_cancel_fee_pct, 25));
    v_tier_label := CASE
      WHEN v_refund_pct = 0   THEN 'forfeit'
      WHEN v_refund_pct < 50  THEN 'partial'
      WHEN v_refund_pct < 100 THEN 'most'
      ELSE 'full'
    END;
  END IF;

  v_deposit_paid := CASE
    WHEN v_order.deposit_paid AND COALESCE(v_order.deposit_amount, 0) > 0
      THEN v_order.deposit_amount
    ELSE 0
  END;
  v_amount_paid := COALESCE(v_order.amount_paid, 0);

  v_refund_amount := ROUND(
    GREATEST(v_deposit_paid, v_amount_paid) * (v_refund_pct / 100.0),
    2
  );

  v_can_postpone := v_days_to_event >= v_postpone_notice;
  v_requires_override := v_days_to_event < v_late_override;

  RETURN jsonb_build_object(
    'order_id',                  p_order_id,
    'event_date',                v_order.event_date,
    'days_to_event',             v_days_to_event,
    'refund_pct',                v_refund_pct,
    'refund_amount',             v_refund_amount,
    'tier_label',                v_tier_label,
    'deposit_paid_amount',       v_deposit_paid,
    'total_amount_paid',         v_amount_paid,
    'can_postpone',              v_can_postpone,
    'postponement_notice_days',  v_postpone_notice,
    'requires_owner_override',   v_requires_override,
    'late_cancel_override_days', v_late_override,
    'policy_snapshot',           v_policy,
    'cancellation_fee_percent',  COALESCE(v_cancel_fee_pct, 25)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_refund_for_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_refund_for_order(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_refund_for_order(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_refund_for_order(uuid) TO service_role;
