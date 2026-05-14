-- Wave 30.4: stop record_invoice_payment from auto-closing the order.
--
-- Callum reported on /admin/invoices: clicking "Mark all paid" warned
-- "this will close the linked order" -- and indeed the RPC was
-- force-flipping orders.status to 'completed' as soon as the invoice
-- balance hit zero. That's catastrophically wrong for a DEPOSIT
-- invoice -- the order had two days until delivery; kitchen prep,
-- driver assignments, vehicle booking, and pre-event reminder
-- triggers all key off status='confirmed'. A premature 'completed'
-- silently breaks every downstream side-effect, then one of the
-- AFTER UPDATE triggers errors and the operator sees a generic
-- failure toast.
--
-- Order completion is a separate workflow concern -- it happens
-- when the driver flips status to 'delivered' and the post-event
-- finalisation runs. record_invoice_payment now only touches
-- payment_status (which IS the right thing to update on a payment
-- event). Returns order_completed:false so existing callers don't
-- crash on the field.
--
-- Idempotency, locking, and ledger writes are unchanged.

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
BEGIN
  -- Idempotency: if this gateway transaction was already recorded,
  -- short-circuit. Same shape as before.
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

  -- Step 1: insert the payment row.
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

  -- Step 2: update the invoice (unchanged).
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

  -- Step 3: update orders.payment_status only -- NEVER touch
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
