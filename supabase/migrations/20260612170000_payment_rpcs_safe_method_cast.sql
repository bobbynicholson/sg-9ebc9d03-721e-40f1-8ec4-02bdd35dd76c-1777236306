-- FIX (2026-06-12, follow-up): gateway payments still not recording.
--
-- The prior migration tried ALTER TYPE payment_method ADD VALUE
-- 'payfast'/'yoco'/'stripe', but ALTER TYPE ... ADD VALUE cannot run
-- inside a transaction block - the Supabase SQL editor wraps a
-- multi-statement script in one transaction, so those statements
-- errored and the enum never gained the values. record_order_payment
-- and record_invoice_payment kept inserting payment_method='payfast'
-- into the enum column and throwing "invalid input value for enum".
--
-- Robust fix that needs no enum change: map the incoming method to a
-- guaranteed-valid enum member inside each RPC. The true provider is
-- already preserved in the text columns gateway / gateway_provider
-- ('payfast'), so no information is lost - only the constrained
-- payment_method column gets a safe value. CREATE OR REPLACE FUNCTION
-- and ALTER TABLE ADD COLUMN are both transaction-safe.

-- Belt-and-braces: ensure completed_at exists (the prior migration's
-- ALTER TABLE is transaction-safe and should have applied, but this is
-- idempotent so re-running is harmless).
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- ── record_order_payment: safe method cast ────────────────────────
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
  v_method public.payment_method;
BEGIN
  -- Map free-text method to a valid enum member. Gateway provider
  -- names (payfast/yoco/stripe) fall through to 'other'; the real
  -- provider is preserved in gateway / gateway_provider below.
  v_method := CASE lower(coalesce(p_payment_method, ''))
    WHEN 'cash' THEN 'cash'
    WHEN 'eft' THEN 'eft'
    WHEN 'bank_transfer' THEN 'eft'
    WHEN 'card' THEN 'card'
    WHEN 'credit_account' THEN 'credit_account'
    ELSE 'other'
  END::public.payment_method;

  IF p_transaction_id IS NOT NULL THEN
    SELECT id INTO v_existing_payment_id
      FROM public.payments
     WHERE order_id = p_order_id
       AND (gateway_transaction_id = p_transaction_id OR transaction_id = p_transaction_id)
     LIMIT 1;
    IF v_existing_payment_id IS NOT NULL THEN
      RETURN v_existing_payment_id;
    END IF;
  END IF;

  INSERT INTO public.payments (
    order_id, amount, payment_method,
    gateway_transaction_id, transaction_id,
    payment_status, processed_at, completed_at, created_at,
    user_id, company_id, client_id, currency,
    payment_type, gateway, gateway_provider, payment_reference
  )
  VALUES (
    p_order_id, p_amount, v_method,
    p_transaction_id, p_transaction_id,
    'completed', now(), now(), now(),
    p_user_id, p_company_id, p_client_id, p_currency,
    p_payment_type, p_gateway_provider, p_gateway_provider, p_transaction_id
  )
  RETURNING id INTO v_new_payment_id;

  SELECT total_amount INTO v_total_amount FROM public.orders WHERE id = p_order_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments
   WHERE order_id = p_order_id AND payment_status = 'completed';

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

-- ── record_invoice_payment: safe method cast ──────────────────────
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
  v_method := CASE lower(coalesce(p_payment_method, ''))
    WHEN 'cash' THEN 'cash'
    WHEN 'eft' THEN 'eft'
    WHEN 'bank_transfer' THEN 'eft'
    WHEN 'card' THEN 'card'
    WHEN 'credit_account' THEN 'credit_account'
    ELSE 'other'
  END::public.payment_method;

  IF p_transaction_id IS NOT NULL THEN
    SELECT id INTO v_existing_payment_id
      FROM public.payments
     WHERE invoice_id = p_invoice_id
       AND (gateway_transaction_id = p_transaction_id OR transaction_id = p_transaction_id)
     LIMIT 1;
    IF v_existing_payment_id IS NOT NULL THEN
      SELECT id, order_id, invoice_number, status, total_amount, client_id, company_id
        INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
      RETURN jsonb_build_object(
        'idempotent', true, 'payment_id', v_existing_payment_id,
        'invoice_id', v_invoice.id, 'order_id', v_invoice.order_id,
        'invoice_number', v_invoice.invoice_number,
        'invoice_status', v_invoice.status::text, 'order_completed', false
      );
    END IF;
  END IF;

  SELECT amount_paid, total_amount INTO v_pre_amount_paid, v_pre_total
    FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;

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
    p_invoice_id, p_amount, v_method,
    p_transaction_id, p_transaction_id, p_transaction_id,
    'completed', now(), now(), now(),
    p_company_id, p_client_id, p_currency, p_gateway_provider, p_gateway_provider
  )
  RETURNING id INTO v_new_payment_id;

  UPDATE public.invoices
     SET status = v_next_status,
         amount_paid = v_post_amount_paid,
         balance_due = v_post_balance_due,
         paid_at = CASE WHEN v_next_status = 'paid'::public.invoice_status THEN COALESCE(paid_at, now()) ELSE paid_at END,
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
       SET payment_status = v_order_payment_status, updated_at = now()
     WHERE id = v_invoice.order_id;
  END IF;

  RETURN jsonb_build_object(
    'idempotent', false, 'payment_id', v_new_payment_id,
    'invoice_id', v_invoice.id, 'order_id', v_invoice.order_id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status::text,
    'amount_paid', v_post_amount_paid, 'balance_due', v_post_balance_due,
    'order_completed', false
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
