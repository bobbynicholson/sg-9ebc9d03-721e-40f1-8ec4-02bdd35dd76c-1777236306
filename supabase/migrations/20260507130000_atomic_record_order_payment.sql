-- P0-10: atomic record_order_payment(...) RPC
--
-- The webhook handler and orderFinancials.recordPayment used to do two
-- sequential round-trips: INSERT into payments, then UPDATE orders SET
-- payment_status = computed-from-sum. If the second query failed (network
-- blip, statement timeout, RLS regression) the payment was recorded but
-- the order's payment_status drifted. Operators saw "deposit paid" on
-- /admin/invoices and "awaiting deposit" on /admin/orders, and there was
-- no nightly reconciliation job to catch up.
--
-- This RPC does both writes in a single transaction. If anything throws,
-- everything rolls back. Caller gets either the new payment row id or an
-- exception.
--
-- Idempotency note: if a payment with the same gateway_transaction_id
-- already exists for this order, the INSERT is a no-op and the function
-- still returns the existing row's id. Webhook callers already check
-- isDuplicatePayFastPayment up front; this is belt-and-braces in case
-- the dedup check itself ever fails open.

CREATE OR REPLACE FUNCTION public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_transaction_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_gateway_provider text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_payment_id uuid;
  v_new_payment_id uuid;
  v_total_amount numeric;
  v_total_paid numeric;
  v_new_status text;
BEGIN
  -- Belt-and-braces idempotency: if this gateway transaction has already
  -- been recorded against this order, return the existing row.
  IF p_transaction_id IS NOT NULL THEN
    SELECT id
      INTO v_existing_payment_id
      FROM public.payments
     WHERE order_id = p_order_id
       AND (gateway_transaction_id = p_transaction_id OR transaction_id = p_transaction_id)
     LIMIT 1;
    IF v_existing_payment_id IS NOT NULL THEN
      RETURN v_existing_payment_id;
    END IF;
  END IF;

  -- 1. Insert the payment row
  INSERT INTO public.payments (
    order_id, amount, payment_method,
    gateway_transaction_id, transaction_id,
    payment_status, processed_at, completed_at, created_at,
    user_id, company_id, client_id, currency,
    payment_type, gateway, gateway_provider, payment_reference
  )
  VALUES (
    p_order_id, p_amount, p_payment_method,
    p_transaction_id, p_transaction_id,
    'completed', now(), now(), now(),
    p_user_id, p_company_id, p_client_id, p_currency,
    p_payment_type, p_gateway_provider, p_gateway_provider, p_transaction_id
  )
  RETURNING id INTO v_new_payment_id;

  -- 2. Recompute payment status from the sum of completed payments
  --    and stamp it on the order in the same transaction.
  SELECT total_amount INTO v_total_amount
    FROM public.orders
   WHERE id = p_order_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments
   WHERE order_id = p_order_id
     AND payment_status = 'completed';

  -- Note: payment_status enum has 'pending'/'partial'/'paid' (plus the
  -- gateway lifecycle values 'processing'/'completed'/'failed'/'refunded'
  -- shared with the payments table). 'unpaid' is NOT an enum value; the
  -- pre-RPC code at orderFinancials.ts wrote it as text and would have
  -- failed if Postgres ever evaluated the cast. Default no-payment to
  -- 'pending' which is the actual canonical value.
  IF v_total_paid >= COALESCE(v_total_amount, 0) AND COALESCE(v_total_amount, 0) > 0 THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE public.orders
     SET payment_status = v_new_status::public.payment_status,
         amount_paid = v_total_paid,
         updated_at = now()
   WHERE id = p_order_id;

  RETURN v_new_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_payment(
  uuid, numeric, text, text, uuid, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_order_payment(
  uuid, numeric, text, text, uuid, uuid, uuid, text, text, text
) TO service_role;
