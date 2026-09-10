-- Wave 17 audit: record_invoice_payment used to overwrite amount_paid
-- and zero balance_due + flip status='paid' on every call. That
-- broke partial payments three ways:
--   1. amount_paid wiped (ledger lost prior deposit)
--   2. balance_due forced to 0 even when invoice still owed money
--   3. status='paid' even on R10 paid against a R2925 invoice -- masked
--      underpayments and the operator's "what's outstanding" view
--      double-counted because the payments.amount=10 row was correct
--      but the invoice itself read as fully paid.
-- Fix: accumulate amount_paid, derive balance_due from total_amount,
-- and pick the right invoice_status enum value based on whether the
-- accumulated total covers the invoice in full. Lock the invoice row
-- FOR UPDATE so concurrent payments against the same invoice serialise.

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_transaction_id text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_currency text DEFAULT 'ZAR',
  p_gateway_provider text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_payment_id uuid;
  v_new_payment_id uuid;
  v_invoice RECORD;
  v_pre_amount_paid numeric;
  v_pre_total numeric;
  v_post_amount_paid numeric;
  v_post_balance_due numeric;
  v_next_status public.invoice_status;
  v_order_completed boolean := false;
  v_order_payment_status public.payment_status;
BEGIN
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
        'idempotent', true,
        'payment_id', v_existing_payment_id,
        'invoice_id', v_invoice.id,
        'order_id', v_invoice.order_id,
        'invoice_number', v_invoice.invoice_number,
        'invoice_status', v_invoice.status::text
      );
    END IF;
  END IF;

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

  INSERT INTO public.payments (
    invoice_id, amount, payment_method,
    gateway_transaction_id, transaction_id, payment_reference,
    payment_status, processed_at, completed_at, created_at,
    company_id, client_id, currency, gateway, gateway_provider
  )
  VALUES (
    p_invoice_id, p_amount, p_payment_method,
    p_transaction_id, p_transaction_id, p_transaction_id,
    'completed', now(), now(), now(),
    p_company_id, p_client_id, p_currency, p_gateway_provider, p_gateway_provider
  )
  RETURNING id INTO v_new_payment_id;

  UPDATE public.invoices
     SET status = v_next_status,
         amount_paid = v_post_amount_paid,
         balance_due = v_post_balance_due,
         paid_at = CASE
                     WHEN v_next_status = 'paid'::public.invoice_status THEN COALESCE(paid_at, now())
                     ELSE paid_at
                   END,
         updated_at = now()
   WHERE id = p_invoice_id
  RETURNING id, order_id, invoice_number, status, total_amount, client_id, company_id
    INTO v_invoice;

  IF v_invoice.order_id IS NOT NULL THEN
    IF v_next_status = 'paid'::public.invoice_status THEN
      v_order_payment_status := 'paid'::public.payment_status;
    ELSE
      v_order_payment_status := 'partial'::public.payment_status;
    END IF;
    UPDATE public.orders
       SET status = CASE
                      WHEN v_next_status = 'paid'::public.invoice_status
                        THEN 'completed'::public.order_status
                      ELSE status
                    END,
           payment_status = v_order_payment_status,
           updated_at = now()
     WHERE id = v_invoice.order_id;
    v_order_completed := (v_next_status = 'paid'::public.invoice_status);
  END IF;

  RETURN jsonb_build_object(
    'idempotent', false,
    'payment_id', v_new_payment_id,
    'invoice_id', v_invoice.id,
    'order_id', v_invoice.order_id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status::text,
    'amount_paid', v_post_amount_paid,
    'balance_due', v_post_balance_due,
    'order_completed', v_order_completed
  );
END;
$$;
