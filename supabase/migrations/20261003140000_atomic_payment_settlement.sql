-- Financial writes commit together. All entry points below are service-only.
-- Lock order: gateway transaction, invoice, order, attempt/payment.
-- Preserve imported money separately from the ledger. Historic triggers also
-- run inside these transactions; replacing their calculations prevents a
-- trigger plus an RPC from counting the same new payment twice.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_opening_paid numeric(12,2) NOT NULL DEFAULT 0;
UPDATE public.invoices i SET payment_opening_paid = GREATEST(0, COALESCE(i.amount_paid,0) - COALESCE((
  SELECT sum(CASE WHEN p.payment_type = 'credit_issue' THEN 0 WHEN p.payment_type = 'refund' THEN -abs(p.amount) ELSE p.amount END)
  FROM public.payments p WHERE p.company_id = i.company_id AND p.payment_status::text IN ('completed','paid','succeeded')
    AND (p.invoice_id = i.id OR (p.invoice_id IS NULL AND i.order_id IS NOT NULL AND p.order_id = i.order_id))
),0)) WHERE payment_opening_paid = 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_opening_paid numeric(12,2) NOT NULL DEFAULT 0;
UPDATE public.orders o SET payment_opening_paid = GREATEST(0, COALESCE(o.amount_paid,0) - COALESCE((
  SELECT sum(CASE WHEN p.payment_type = 'credit_issue' THEN 0 WHEN p.payment_type = 'refund' THEN -abs(p.amount) ELSE p.amount END)
  FROM public.payments p WHERE p.company_id = o.company_id AND p.payment_status::text IN ('completed','paid','succeeded')
    AND (p.order_id = o.id OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = p.invoice_id AND i.order_id = o.id AND i.company_id = o.company_id))
),0)) WHERE payment_opening_paid = 0;

CREATE OR REPLACE FUNCTION public.reconcile_order_payment_totals(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid numeric; v_total numeric; v_target numeric; v_percent numeric;
  v_deposit_met boolean; v_fully_paid boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT GREATEST(0, v_order.payment_opening_paid + COALESCE(sum(CASE
    WHEN p.payment_type = 'refund' THEN -abs(p.amount) WHEN p.payment_type = 'credit_issue' THEN 0 ELSE p.amount END),0))
    INTO v_paid FROM public.payments p WHERE p.company_id = v_order.company_id
    AND p.payment_status::text IN ('completed','paid','succeeded')
    AND (p.order_id = p_order_id OR EXISTS (SELECT 1 FROM public.invoices i
      WHERE i.id = p.invoice_id AND i.order_id = p_order_id AND i.company_id = v_order.company_id));
  v_total := COALESCE(v_order.total_amount,0);
  SELECT deposit_percent INTO v_percent FROM public.companies WHERE id = v_order.company_id;
  v_percent := COALESCE(NULLIF(v_order.deposit_percentage,0), NULLIF(v_percent,0),50);
  IF v_percent <= 0 OR v_percent >= 100 THEN v_percent := 50; END IF;
  v_target := CASE WHEN v_order.event_date::date <= CURRENT_DATE THEN v_total
    WHEN COALESCE(v_order.deposit_amount,0) > 0 THEN LEAST(v_order.deposit_amount,v_total)
    ELSE round(v_total*v_percent/100,2) END;
  v_deposit_met := v_target > 0 AND v_paid >= v_target;
  v_fully_paid := v_total > 0 AND v_paid >= v_total;
  UPDATE public.orders SET amount_paid = v_paid, balance_amount = GREATEST(0,v_total-v_paid),
    payment_status = CASE WHEN payment_status::text IN ('refunded','partially_refunded') THEN payment_status
      WHEN v_fully_paid THEN 'paid'::public.payment_status WHEN v_paid > 0 THEN 'partial'::public.payment_status ELSE 'pending'::public.payment_status END,
    deposit_paid = v_deposit_met,
    deposit_paid_at = CASE WHEN v_deposit_met THEN COALESCE(deposit_paid_at,now()) ELSE NULL END,
    balance_paid = v_fully_paid,
    balance_paid_at = CASE WHEN v_fully_paid THEN COALESCE(balance_paid_at,now()) ELSE NULL END,
    updated_at = now() WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_order_payment_projection_from_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.order_id AND company_id = NEW.company_id) THEN
    -- Use the entire order's ledger once, including separate deposit/final
    -- invoices. Copying one invoice's paid total would lose earlier payments.
    PERFORM public.reconcile_order_payment_totals(NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.payment_gateway_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  provider text NOT NULL CHECK (provider IN ('payfast', 'yoco', 'stripe')),
  transaction_id text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, transaction_id)
);
ALTER TABLE public.payment_gateway_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_gateway_events FROM anon, authenticated;
GRANT ALL ON public.payment_gateway_events TO service_role;
CREATE INDEX IF NOT EXISTS payment_gateway_events_pending
  ON public.payment_gateway_events (last_checked_at NULLS FIRST, created_at)
  WHERE processed_at IS NULL;

-- Receipt jobs are durable even when the web process dies after settlement.
CREATE TABLE IF NOT EXISTS public.payment_receipt_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  kind text NOT NULL CHECK (kind IN ('received', 'claimed', 'rejected')),
  delivered_at timestamptz,
  notified_at timestamptz,
  client_email_sent_at timestamptz,
  owner_email_sent_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, kind)
);
ALTER TABLE public.payment_receipt_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_receipt_outbox FROM anon, authenticated;
GRANT ALL ON public.payment_receipt_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.queue_payment_receipt(p_payment_id uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.payment_receipt_outbox (company_id, payment_id, kind, payload)
  SELECT p.company_id, p.id, p_kind, jsonb_build_object(
    'amount', p.amount, 'currency', p.currency, 'notes', p.notes,
    'invoice_id', p.invoice_id, 'order_id', p.order_id, 'client_id', p.client_id,
    'reference', COALESCE(i.invoice_number, o.order_number, p.payment_reference),
    'total_amount', COALESCE(i.total_amount, o.total_amount, 0),
    'amount_paid', COALESCE(i.amount_paid, o.amount_paid, 0),
    'balance_due', COALESCE(i.balance_due, o.balance_amount, 0),
    'overpayment_amount', GREATEST(0, COALESCE(i.amount_paid, o.amount_paid, 0) - COALESCE(i.total_amount, o.total_amount, 0)),
    'client_email', COALESCE(c.email, o.client_email), 'company_email', co.email,
    'company_name', co.company_name)
  FROM public.payments p LEFT JOIN public.invoices i ON i.id = p.invoice_id
    LEFT JOIN public.orders o ON o.id = p.order_id
    LEFT JOIN public.clients c ON c.id = p.client_id
    JOIN public.companies co ON co.id = p.company_id
  WHERE p.id = p_payment_id
  ON CONFLICT (payment_id, kind) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_invoice_payment_totals(
  p_invoice_id uuid, p_minimum_paid numeric DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_ledger numeric;
  v_paid numeric;
  v_balance numeric;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT COALESCE(sum(CASE WHEN payment_type = 'refund' THEN -abs(amount) WHEN payment_type = 'credit_issue' THEN 0 ELSE amount END), 0) INTO v_ledger FROM public.payments
   WHERE (invoice_id = p_invoice_id OR (invoice_id IS NULL AND v_invoice.order_id IS NOT NULL AND order_id = v_invoice.order_id)) AND company_id = v_invoice.company_id
     AND payment_status::text IN ('completed', 'paid', 'succeeded')
;
  -- Keep imported/manual paid totals that predate the ledger, while repairing
  -- previously interrupted writes. New money must be added exactly once.
  v_paid := GREATEST(COALESCE(v_invoice.amount_paid, 0), COALESCE(p_minimum_paid,0), v_invoice.payment_opening_paid + v_ledger);
  v_balance := GREATEST(0, round(v_invoice.total_amount - v_paid, 2));
  UPDATE public.invoices SET amount_paid = v_paid, balance_due = v_balance,
    status = CASE
      WHEN status::text IN ('cancelled', 'void', 'written_off') THEN status
      WHEN v_balance = 0 THEN 'paid'::public.invoice_status
      WHEN v_paid > 0 THEN 'partially_paid'::public.invoice_status
      ELSE status END,
    paid_at = CASE WHEN v_balance = 0 THEN COALESCE(paid_at, now()) ELSE paid_at END,
    updated_at = now()
  WHERE id = p_invoice_id;
  -- The invoice trigger projects totals and threshold-based flags to the order.
  -- Payment alone never completes an event that has not been delivered.
  UPDATE public.orders SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now()),
    updated_at = now()
  WHERE id = v_invoice.order_id AND company_id = v_invoice.company_id
    AND status::text = 'pending' AND deposit_paid IS TRUE AND deleted_at IS NULL;
  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'amount_paid', v_paid,
    'balance_due', v_balance, 'overpayment_amount', GREATEST(0, v_paid - v_invoice.total_amount),
    'invoice_status', (SELECT status::text FROM public.invoices WHERE id = p_invoice_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_paid numeric;
  v_balance numeric;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT GREATEST(0, v_invoice.payment_opening_paid + COALESCE(sum(
    CASE WHEN payment_type = 'credit_issue' THEN 0 WHEN payment_type = 'refund' THEN -abs(amount) ELSE amount END),0))
    INTO v_paid FROM public.payments
    WHERE company_id = v_invoice.company_id AND payment_status::text IN ('completed','paid','succeeded')
      AND (invoice_id = p_invoice_id OR (invoice_id IS NULL AND v_invoice.order_id IS NOT NULL AND order_id = v_invoice.order_id));
  v_balance := GREATEST(0, v_invoice.total_amount - v_paid);
  UPDATE public.invoices SET amount_paid = v_paid, balance_due = v_balance,
    status = CASE WHEN status::text IN ('cancelled','void','written_off') THEN status
      WHEN v_balance = 0 THEN 'paid'::public.invoice_status
      WHEN v_paid > 0 THEN 'partially_paid'::public.invoice_status
      WHEN status::text IN ('paid','partially_paid') THEN 'sent'::public.invoice_status ELSE status END,
    paid_at = CASE WHEN v_balance = 0 THEN COALESCE(paid_at,now()) ELSE NULL END,
    updated_at = now() WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_invoice_on_payment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice_id uuid;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_invoice_id := NEW.invoice_id;
    IF v_invoice_id IS NULL AND NEW.order_id IS NOT NULL THEN
      SELECT id INTO v_invoice_id FROM public.invoices WHERE order_id = NEW.order_id
        AND company_id = NEW.company_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_invoice_id IS NOT NULL THEN PERFORM public.recalc_invoice_totals(v_invoice_id); END IF;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_invoice_id := OLD.invoice_id;
    IF v_invoice_id IS NULL AND OLD.order_id IS NOT NULL THEN
      SELECT id INTO v_invoice_id FROM public.invoices WHERE order_id = OLD.order_id
        AND company_id = OLD.company_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_invoice_id IS NOT NULL THEN PERFORM public.recalc_invoice_totals(v_invoice_id); END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_order_payment_totals_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order_id uuid; v_invoice_id uuid;
BEGIN
  FOR v_order_id IN SELECT DISTINCT linked_id FROM (
    SELECT NEW.order_id linked_id WHERE TG_OP IN ('INSERT','UPDATE')
    UNION ALL SELECT OLD.order_id WHERE TG_OP IN ('UPDATE','DELETE')
    UNION ALL SELECT order_id FROM public.invoices WHERE TG_OP IN ('INSERT','UPDATE') AND id = NEW.invoice_id
    UNION ALL SELECT order_id FROM public.invoices WHERE TG_OP IN ('UPDATE','DELETE') AND id = OLD.invoice_id
  ) refs WHERE linked_id IS NOT NULL
  LOOP
    SELECT id INTO v_invoice_id FROM public.invoices WHERE order_id = v_order_id AND deleted_at IS NULL
      ORDER BY CASE WHEN id = NEW.invoice_id OR id = OLD.invoice_id THEN 0 ELSE 1 END, created_at ASC LIMIT 1;
    IF v_invoice_id IS NOT NULL THEN
      -- This makes the last payment trigger use the same invoice projection,
      -- including first-payment thresholds, imported money and refunds.
      PERFORM public.refresh_invoice_payment_totals(v_invoice_id,0);
    ELSE PERFORM public.reconcile_order_payment_totals(v_order_id); END IF;
  END LOOP;
  RETURN COALESCE(NEW,OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_verified_gateway_payment(
  p_provider text, p_transaction_id text, p_company_id uuid,
  p_reference_id uuid, p_payment_type text, p_invoice_id uuid,
  p_attempt_id uuid, p_amount numeric, p_currency text,
  p_event_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_attempt public.payment_attempts%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_invoice_id uuid := p_invoice_id;
  v_order_id uuid;
  v_client_id uuid;
  v_duplicate boolean := false;
  v_totals jsonb := '{}'::jsonb;
  v_paid numeric;
  v_total numeric;
  v_target numeric;
  v_percent numeric;
BEGIN
  IF p_provider IS NULL OR p_payment_type IS NULL OR p_provider NOT IN ('payfast', 'yoco', 'stripe') OR p_transaction_id IS NULL
     OR length(trim(p_transaction_id)) = 0 OR p_company_id IS NULL
     OR p_reference_id IS NULL OR p_payment_type NOT IN ('invoice', 'deposit', 'balance')
     OR p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_amount <= 0 OR round(p_amount, 2) <> p_amount OR p_currency IS NULL THEN
    RAISE EXCEPTION 'Invalid settlement arguments' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gateway:' || p_provider || ':' || p_transaction_id, 0));
  IF p_attempt_id IS NOT NULL THEN
    SELECT * INTO v_attempt FROM public.payment_attempts WHERE id = p_attempt_id;
    IF NOT FOUND OR v_attempt.company_id IS DISTINCT FROM p_company_id
      OR v_attempt.provider IS DISTINCT FROM p_provider
      OR v_attempt.payment_type IS DISTINCT FROM p_payment_type
      OR v_attempt.amount IS DISTINCT FROM p_amount
      OR upper(v_attempt.currency) IS DISTINCT FROM upper(p_currency)
      OR (p_payment_type = 'invoice' AND v_attempt.invoice_id IS DISTINCT FROM p_reference_id)
      OR (p_payment_type <> 'invoice' AND v_attempt.order_id IS DISTINCT FROM p_reference_id)
      OR (p_invoice_id IS NOT NULL AND v_attempt.invoice_id IS DISTINCT FROM p_invoice_id) THEN
      RAISE EXCEPTION 'Payment does not match checkout attempt' USING ERRCODE = '22023';
    END IF;
    v_invoice_id := v_attempt.invoice_id;
  END IF;
  IF p_payment_type = 'invoice' THEN v_invoice_id := p_reference_id;
  ELSE v_order_id := p_reference_id; END IF;
  IF v_invoice_id IS NULL AND v_order_id IS NOT NULL THEN
    -- Stable lookup also on a duplicate, after the invoice has become paid.
    SELECT id INTO v_invoice_id FROM public.invoices
     WHERE order_id = v_order_id AND company_id = p_company_id AND deleted_at IS NULL
     ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_invoice_id FOR UPDATE;
    IF NOT FOUND OR v_invoice.company_id IS DISTINCT FROM p_company_id
      OR (v_order_id IS NOT NULL AND v_invoice.order_id IS DISTINCT FROM v_order_id) THEN
      RAISE EXCEPTION 'Invoice does not belong to this payment' USING ERRCODE = '22023';
    END IF;
    v_order_id := v_invoice.order_id;
    v_client_id := v_invoice.client_id;
  END IF;
  IF v_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.company_id IS DISTINCT FROM p_company_id THEN
      RAISE EXCEPTION 'Order does not belong to this company' USING ERRCODE = '22023';
    END IF;
    IF v_client_id IS NOT NULL AND v_client_id IS DISTINCT FROM v_order.client_id THEN
      RAISE EXCEPTION 'Order/invoice client mismatch' USING ERRCODE = '22023';
    END IF;
    v_client_id := v_order.client_id;
  END IF;
  IF v_client_id IS NULL OR (p_attempt_id IS NOT NULL AND v_attempt.client_id IS DISTINCT FROM v_client_id) THEN
    RAISE EXCEPTION 'Payment client mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_attempt_id IS NULL AND upper(p_currency) IS DISTINCT FROM
    upper(COALESCE(v_order.currency, v_invoice.currency, 'ZAR')) THEN
    RAISE EXCEPTION 'Payment currency mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_payment FROM public.payments
   WHERE gateway_provider = p_provider
     AND (gateway_transaction_id = p_transaction_id OR transaction_id = p_transaction_id)
   ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  v_duplicate := FOUND;
  IF v_duplicate THEN
    IF v_payment.company_id IS DISTINCT FROM p_company_id
      OR (v_payment.order_id IS NOT NULL AND v_payment.order_id IS DISTINCT FROM v_order_id)
      OR (v_payment.invoice_id IS NOT NULL AND v_payment.invoice_id IS DISTINCT FROM v_invoice_id)
      OR (v_payment.order_id IS NULL AND v_payment.invoice_id IS NULL)
      OR v_payment.amount IS DISTINCT FROM p_amount
      OR upper(v_payment.currency) IS DISTINCT FROM upper(p_currency)
      OR v_payment.payment_status::text NOT IN ('completed', 'paid', 'succeeded') THEN
      RAISE EXCEPTION 'Transaction already belongs to another payment' USING ERRCODE = '23505';
    END IF;
    UPDATE public.payments SET order_id = v_order_id, invoice_id = v_invoice_id
     WHERE id = v_payment.id;
  ELSE
    -- A valid saved checkout remains collectible after a cancellation/deletion.
    -- Record real money and preserve the cancelled state for operator review.
    IF p_attempt_id IS NULL AND (v_invoice.deleted_at IS NOT NULL OR v_order.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Legacy payment target is deleted' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.payments (company_id, client_id, order_id, invoice_id,
      amount, currency, payment_method, payment_type, payment_status,
      gateway, gateway_provider, transaction_id, gateway_transaction_id,
      payment_reference, processed_at, completed_at)
    VALUES (p_company_id, v_client_id, v_order_id, v_invoice_id,
      p_amount, upper(p_currency), 'other', p_payment_type, 'completed',
      p_provider, p_provider, p_transaction_id, p_transaction_id,
      p_transaction_id, now(), now()) RETURNING * INTO v_payment;
  END IF;
  IF v_invoice_id IS NOT NULL THEN
    v_totals := public.refresh_invoice_payment_totals(v_invoice_id, COALESCE(v_invoice.amount_paid,0) + CASE WHEN v_duplicate THEN 0 ELSE p_amount END);
  ELSE
    PERFORM public.reconcile_order_payment_totals(v_order_id);
    SELECT * INTO v_order FROM public.orders WHERE id = v_order_id;
    UPDATE public.orders SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at,now()), updated_at = now()
      WHERE id = v_order_id AND status::text = 'pending' AND deposit_paid IS TRUE AND deleted_at IS NULL;
    v_totals := jsonb_build_object('amount_paid', v_order.amount_paid, 'balance_due', v_order.balance_amount,
      'overpayment_amount', GREATEST(0, v_order.amount_paid - v_order.total_amount));
  END IF;
  IF p_attempt_id IS NOT NULL THEN
    UPDATE public.payment_attempts SET status = 'succeeded', succeeded_at = COALESCE(succeeded_at, now()),
      provider_status = 'COMPLETE', failure_reason = NULL, last_checked_at = now(), updated_at = now()
    WHERE id = p_attempt_id;
  END IF;
  IF p_event_id IS NOT NULL THEN
    UPDATE public.payment_gateway_events SET processed_at = now(), last_error = NULL, last_checked_at = now()
     WHERE id = p_event_id AND company_id = p_company_id AND provider = p_provider AND transaction_id = p_transaction_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Settlement event mismatch' USING ERRCODE = '22023'; END IF;
  END IF;
  PERFORM public.queue_payment_receipt(v_payment.id, 'received');
  RETURN v_totals || jsonb_build_object('payment_id', v_payment.id, 'duplicate', v_duplicate,
    'invoice_id', v_invoice_id, 'order_id', v_order_id,
    'order', CASE WHEN v_order_id IS NULL THEN NULL ELSE (SELECT to_jsonb(o) FROM public.orders o WHERE id = v_order_id) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_eft_payment_claim(
  p_invoice_id uuid, p_company_id uuid, p_amount numeric, p_paid_at timestamptz,
  p_notes text DEFAULT NULL, p_proof_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_currency text;
BEGIN
  IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0
    OR round(p_amount, 2) <> p_amount THEN RAISE EXCEPTION 'Invalid EFT amount' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.company_id IS DISTINCT FROM p_company_id OR v_invoice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '22023'; END IF;
  IF v_invoice.status::text IN ('paid', 'cancelled', 'void', 'written_off') OR v_invoice.balance_due <= 0 THEN
    RAISE EXCEPTION 'Invoice cannot receive a new EFT claim' USING ERRCODE = '22023'; END IF;
  IF p_proof_path IS NOT NULL AND p_proof_path NOT LIKE p_company_id::text || '/' || p_invoice_id::text || '/%' THEN
    RAISE EXCEPTION 'Proof path mismatch' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE invoice_id = p_invoice_id
    AND company_id = p_company_id AND payment_method::text = 'eft' AND payment_status::text = 'pending'
    ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF p_proof_path IS NOT NULL THEN
      UPDATE public.payments SET payment_proof_path = p_proof_path, payment_proof_uploaded_at = now()
        WHERE id = v_payment.id;
    END IF;
    RETURN jsonb_build_object('payment_id', v_payment.id, 'deduped', true);
  END IF;
  SELECT currency INTO v_currency FROM public.orders WHERE id = v_invoice.order_id;
  INSERT INTO public.payments (company_id, client_id, order_id, invoice_id, payment_reference,
    payment_method, payment_status, amount, currency, payment_date, notes, payment_proof_path, payment_proof_uploaded_at)
  VALUES (p_company_id, v_invoice.client_id, v_invoice.order_id, p_invoice_id, v_invoice.invoice_number,
    'eft', 'pending', p_amount, COALESCE(v_currency, v_invoice.currency, 'ZAR'), COALESCE(p_paid_at, now()),
    left(p_notes, 500), p_proof_path, CASE WHEN p_proof_path IS NULL THEN NULL ELSE now() END)
  RETURNING * INTO v_payment;
  PERFORM public.queue_payment_receipt(v_payment.id, 'claimed');
  RETURN jsonb_build_object('payment_id', v_payment.id, 'deduped', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_eft_payment_claim(
  p_payment_id uuid, p_company_id uuid, p_action text, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_duplicate boolean;
  v_totals jsonb := '{}'::jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('confirm', 'reject') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_payment.company_id IS DISTINCT FROM p_company_id OR v_payment.invoice_id IS NULL
    OR v_payment.payment_method::text <> 'eft' OR v_payment.gateway_provider IS NOT NULL THEN
    RAISE EXCEPTION 'Not an EFT claim for this company' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.company_id IS DISTINCT FROM p_company_id OR v_invoice.deleted_at IS NOT NULL
    OR v_invoice.client_id IS DISTINCT FROM v_payment.client_id
    OR v_invoice.order_id IS DISTINCT FROM v_payment.order_id THEN
    RAISE EXCEPTION 'EFT invoice mismatch' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  v_duplicate := (p_action = 'confirm' AND v_payment.payment_status::text = 'completed')
    OR (p_action = 'reject' AND v_payment.payment_status::text = 'failed');
  IF NOT v_duplicate AND v_payment.payment_status::text <> 'pending' THEN
    RAISE EXCEPTION 'Claim already resolved by a different action' USING ERRCODE = '23505'; END IF;
  IF p_action = 'confirm' THEN
    IF v_payment.amount <= 0 THEN RAISE EXCEPTION 'Invalid EFT amount' USING ERRCODE = '22023'; END IF;
    UPDATE public.payments SET payment_status = 'completed', processed_at = COALESCE(processed_at, now()),
      completed_at = COALESCE(completed_at, now()) WHERE id = p_payment_id;
    v_totals := public.refresh_invoice_payment_totals(v_invoice.id, COALESCE(v_invoice.amount_paid,0) + CASE WHEN v_duplicate THEN 0 ELSE v_payment.amount END);
  ELSIF NOT v_duplicate THEN
    UPDATE public.payments SET payment_status = 'failed', failed_at = now(),
      notes = concat_ws(E'\n', notes, 'Rejected by admin: ' || COALESCE(left(p_reason, 500), 'Not matched')) WHERE id = p_payment_id;
  END IF;
  PERFORM public.queue_payment_receipt(p_payment_id, CASE WHEN p_action = 'confirm' THEN 'received' ELSE 'rejected' END);
  RETURN v_totals || jsonb_build_object('payment_id', p_payment_id, 'duplicate', v_duplicate,
    'action', CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'rejected' END, 'order_closed', false,
    'order_id', v_invoice.order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_payment_receipt(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_payment_receipt(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_invoice_payment_totals(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_verified_gateway_payment(text, text, uuid, uuid, text, uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_eft_payment_claim(uuid, uuid, numeric, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_eft_payment_claim(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_invoice_payment_totals(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_verified_gateway_payment(text, text, uuid, uuid, text, uuid, uuid, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_eft_payment_claim(uuid, uuid, numeric, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_eft_payment_claim(uuid, uuid, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';

-- Credit debit, payment and invoice projection also commit together.
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
  v_invoice public.invoices%ROWTYPE;
BEGIN
  IF p_company_id IS NULL OR p_client_id IS NULL OR p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_required_args');
  END IF;
  IF p_requested_amount IS NULL OR p_requested_amount <= 0 OR p_requested_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
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

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.company_id IS DISTINCT FROM p_company_id
    OR v_invoice.client_id IS DISTINCT FROM p_client_id OR v_invoice.order_id IS DISTINCT FROM p_order_id
    OR v_invoice.deleted_at IS NOT NULL OR v_invoice.status::text IN ('cancelled', 'void', 'written_off') THEN
    RAISE EXCEPTION 'Credit invoice does not match client/company' USING ERRCODE = '22023'; END IF;
  PERFORM public.refresh_invoice_payment_totals(p_invoice_id, 0);
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  -- Read current balance under the lock.
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'credit_issue'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'credit_redeem'), 0)
  INTO v_issued, v_redeemed
  FROM public.payments
  WHERE company_id = p_company_id
    AND client_id  = p_client_id
    AND payment_type IN ('credit_issue', 'credit_redeem')
    AND payment_status::text IN ('completed', 'paid', 'succeeded');
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
    payment_method, payment_reference, currency,
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
    'credit_account', 'credit:' || p_invoice_id::text, COALESCE(v_invoice.currency, 'ZAR'),
    'completed',
    'Store credit applied to invoice',
    p_created_by_user_id
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.refresh_invoice_payment_totals(p_invoice_id, COALESCE(v_invoice.amount_paid,0) + v_to_redeem);
  PERFORM public.queue_payment_receipt(v_payment_id, 'received');
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
