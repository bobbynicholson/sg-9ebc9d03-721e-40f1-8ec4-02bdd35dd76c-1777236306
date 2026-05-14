-- Wave 29.1: atomic store-credit redemption.
--
-- Wave 28 issued credit via payments{type:'credit_issue'} but never
-- built the spend path. A client with R485 credit on file couldn't
-- actually use it on a future deposit invoice -- the cashflow nudge
-- toward credit was meaningless.
--
-- This RPC is the single chokepoint for spending credit. It runs
-- inside a transaction with a per-client advisory lock so two
-- concurrent redeem attempts (e.g. client mash-clicks "Pay") cannot
-- double-spend the same balance.
--
-- Returns the actual amount redeemed (capped by available balance
-- and the invoice's balance_due) and the inserted payments.id so the
-- caller can chain a gateway charge for the remainder.
--
-- Caller responsibility:
--   - Update invoices.balance_due / amount_paid / status after the
--     redeem lands. We don't do it here because the same caller may
--     also need to record a gateway payment for the remainder, and
--     we don't want two roundtrips writing the invoice row.
--   - Insert the audit_logs entry (we keep the RPC focused on money).

CREATE OR REPLACE FUNCTION public.redeem_client_credit(
  p_company_id      uuid,
  p_client_id       uuid,
  p_invoice_id      uuid,
  p_order_id        uuid,
  p_requested_amount numeric,
  p_created_by_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lock_key      bigint;
  v_issued        numeric := 0;
  v_redeemed      numeric := 0;
  v_available     numeric := 0;
  v_balance_due   numeric := 0;
  v_to_redeem     numeric := 0;
  v_payment_id    uuid;
BEGIN
  IF p_company_id IS NULL OR p_client_id IS NULL OR p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_required_args');
  END IF;
  IF p_requested_amount IS NULL OR p_requested_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'amount_must_be_positive');
  END IF;

  -- Per-(company, client) advisory lock. hashtextextended takes the
  -- string repr; the lock auto-releases at txn end. Two parallel
  -- redeems for the same wallet now serialise; redeems for different
  -- clients run in parallel.
  v_lock_key := hashtextextended(
    p_company_id::text || ':' || p_client_id::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Read current balance under the lock.
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'credit_issue'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'credit_redeem'), 0)
  INTO v_issued, v_redeemed
  FROM public.payments
  WHERE company_id = p_company_id
    AND client_id  = p_client_id
    AND payment_type IN ('credit_issue', 'credit_redeem');
  v_available := GREATEST(0, v_issued - v_redeemed);

  IF v_available <= 0 THEN
    RETURN jsonb_build_object(
      'redeemed_amount', 0,
      'available_after', 0,
      'reason', 'no_credit_available'
    );
  END IF;

  -- Cap by invoice balance so we never over-redeem.
  SELECT COALESCE(balance_due, 0)
    INTO v_balance_due
  FROM public.invoices
  WHERE id = p_invoice_id
    AND company_id = p_company_id
    AND deleted_at IS NULL;
  IF v_balance_due IS NULL OR v_balance_due <= 0 THEN
    RETURN jsonb_build_object(
      'redeemed_amount', 0,
      'available_after', v_available,
      'reason', 'invoice_already_paid'
    );
  END IF;

  v_to_redeem := LEAST(v_available, v_balance_due, p_requested_amount);
  v_to_redeem := ROUND(v_to_redeem, 2);
  IF v_to_redeem <= 0 THEN
    RETURN jsonb_build_object(
      'redeemed_amount', 0,
      'available_after', v_available,
      'reason', 'nothing_to_redeem'
    );
  END IF;

  -- Insert the redeem row. payment_status='completed' because the
  -- credit is internal -- there is no external clearing window.
  INSERT INTO public.payments (
    company_id,
    order_id,
    invoice_id,
    client_id,
    payment_type,
    amount,
    payment_status,
    reason,
    created_by_user_id
  ) VALUES (
    p_company_id,
    p_order_id,
    p_invoice_id,
    p_client_id,
    'credit_redeem',
    v_to_redeem,
    'completed',
    'Store credit applied to invoice',
    p_created_by_user_id
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'redeemed_amount', v_to_redeem,
    'available_after', v_available - v_to_redeem,
    'invoice_balance_after', v_balance_due - v_to_redeem,
    'payment_id', v_payment_id,
    'reason', 'ok'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_client_credit(uuid, uuid, uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_client_credit(uuid, uuid, uuid, uuid, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_client_credit(uuid, uuid, uuid, uuid, numeric, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_client_credit(uuid, uuid, uuid, uuid, numeric, uuid) TO service_role;
