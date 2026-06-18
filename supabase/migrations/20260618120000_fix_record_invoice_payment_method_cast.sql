-- FIX (2026-06-18): invoice payments stopped recording entirely.
--
-- Symptom: client pays on PayFast (incl. the sandbox return backstop
-- /api/payments/confirm-return) but the invoice stays 'sent' / "awaiting
-- payment" - amount_paid never moves. confirm-return 500s and the IPN
-- webhook's invoice branch 500s. No payments row is written.
--
-- Real error from record_invoice_payment:
--   42804: column "payment_method" is of type payment_method but
--          expression is of type text. (You will need to ... cast.)
--
-- Cause: the catch-up migration 20260617130000 §2 re-created
-- record_invoice_payment from the OLD "no_auto_complete" body
-- (20260514240000), which inserts the raw text parameter p_payment_method
-- straight into the payment_method ENUM column. That clobbered the
-- 20260612170000 version, whose whole point was to map the free-text
-- method to a valid enum member via a casted local (v_method). Postgres
-- will not implicitly cast text -> enum in an INSERT, so every call threw
-- 42804 and rolled back. Gateway names like 'payfast' aren't enum members
-- anyway - they're preserved in the gateway / gateway_provider text cols.
--
-- This migration re-applies the SAFE-CAST body: it keeps the
-- no-auto-complete behaviour (only orders.payment_status is touched,
-- never orders.status) AND restores the v_method enum mapping. Idempotent
-- (CREATE OR REPLACE). Safe to run on its own in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id        uuid,
  p_amount            numeric,
  p_payment_method    text,
  p_transaction_id    text DEFAULT NULL::text,
  p_company_id        uuid DEFAULT NULL::uuid,
  p_client_id         uuid DEFAULT NULL::uuid,
  p_currency          text DEFAULT 'ZAR'::text,
  p_gateway_provider  text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_payment_id uuid;
  v_new_payment_id      uuid;
  v_invoice             RECORD;
  v_pre_amount_paid     numeric;
  v_pre_total           numeric;
  v_post_amount_paid    numeric;
  v_post_balance_due    numeric;
  v_next_status         public.invoice_status;
  v_order_payment_status public.payment_status;
  v_method              public.payment_method;
BEGIN
  -- Map free-text method to a valid enum member. Gateway provider names
  -- (payfast/yoco/stripe) fall through to 'other'; the real provider is
  -- preserved in the gateway / gateway_provider text columns below.
  v_method := CASE lower(coalesce(p_payment_method, ''))
    WHEN 'cash' THEN 'cash'
    WHEN 'eft' THEN 'eft'
    WHEN 'bank_transfer' THEN 'eft'
    WHEN 'card' THEN 'card'
    WHEN 'credit_account' THEN 'credit_account'
    ELSE 'other'
  END::public.payment_method;

  -- Idempotency: if this gateway transaction was already recorded,
  -- short-circuit.
  IF p_transaction_id IS NOT NULL THEN
    SELECT id
      INTO v_existing_payment_id
      FROM public.payments
     WHERE invoice_id = p_invoice_id
       AND (gateway_transaction_id = p_transaction_id OR transaction_id = p_transaction_id)
     LIMIT 1;
    IF v_existing_payment_id IS NOT NULL THEN
      SELECT id, order_id, invoice_number, status, total_amount, client_id, company_id
        INTO v_invoice
        FROM public.invoices
       WHERE id = p_invoice_id;
      RETURN jsonb_build_object(
        'idempotent',     true,
        'payment_id',     v_existing_payment_id,
        'invoice_id',     v_invoice.id,
        'order_id',       v_invoice.order_id,
        'invoice_number', v_invoice.invoice_number,
        'invoice_status', v_invoice.status::text,
        'order_completed', false
      );
    END IF;
  END IF;

  -- Snapshot + lock the invoice row.
  SELECT amount_paid, total_amount
    INTO v_pre_amount_paid, v_pre_total
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  v_post_amount_paid := COALESCE(v_pre_amount_paid, 0) + p_amount;
  v_post_balance_due := GREATEST(0, COALESCE(v_pre_total, 0) - v_post_amount_paid);

  IF v_post_balance_due < 0.01 THEN
    v_next_status := 'paid'::public.invoice_status;
  ELSIF v_post_amount_paid > 0 THEN
    v_next_status := 'partially_paid'::public.invoice_status;
  ELSE
    v_next_status := 'sent'::public.invoice_status;
  END IF;

  -- Step 1: insert the payment row (casted method).
  INSERT INTO public.payments (
    invoice_id, amount, payment_method,
    gateway_transaction_id, transaction_id, payment_reference,
    payment_status, processed_at, completed_at, created_at,
    company_id, client_id, currency, gateway, gateway_provider
  )
  VALUES (
    p_invoice_id, p_amount, v_method,
    p_transaction_id, p_transaction_id, p_transaction_id,
    'completed', now(), now(), now(),
    p_company_id, p_client_id, p_currency, p_gateway_provider, p_gateway_provider
  )
  RETURNING id INTO v_new_payment_id;

  -- Step 2: update the invoice.
  UPDATE public.invoices
     SET status      = v_next_status,
         amount_paid = v_post_amount_paid,
         balance_due = v_post_balance_due,
         paid_at = CASE
                     WHEN v_next_status = 'paid'::public.invoice_status THEN COALESCE(paid_at, now())
                     ELSE paid_at
                   END,
         updated_at  = now()
   WHERE id = p_invoice_id
  RETURNING id, order_id, invoice_number, status, total_amount, client_id, company_id
    INTO v_invoice;

  -- Step 3: update orders.payment_status ONLY -- NEVER touch
  -- orders.status. Order completion is a separate workflow.
  IF v_invoice.order_id IS NOT NULL THEN
    IF v_next_status = 'paid'::public.invoice_status THEN
      v_order_payment_status := 'paid'::public.payment_status;
    ELSE
      v_order_payment_status := 'partial'::public.payment_status;
    END IF;
    UPDATE public.orders
       SET payment_status = v_order_payment_status,
           updated_at     = now()
     WHERE id = v_invoice.order_id;
  END IF;

  RETURN jsonb_build_object(
    'idempotent',     false,
    'payment_id',     v_new_payment_id,
    'invoice_id',     v_invoice.id,
    'order_id',       v_invoice.order_id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status::text,
    'amount_paid',    v_post_amount_paid,
    'balance_due',    v_post_balance_due,
    'order_completed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(
  uuid, numeric, text, text, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(
  uuid, numeric, text, text, uuid, uuid, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
