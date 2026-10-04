-- Latest company quote/payment migrations for an existing, migrated database.
-- Run this bundle OR the individual files, never both. See docs/payments-payfast-eft-audit.md.
BEGIN;

-- Source: 20261003110000_add_quote_initial_payment_amount.sql
-- Preserve the first payment amount agreed on a quote so the same value
-- carries into the accepted order and the client's payment link.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS initial_payment_amount numeric(12, 2);


-- Source: 20261003120000_update_payment_request_email_summary.sql
-- Make the global invoice emails state the contract total, paid amount,
-- and current outstanding balance alongside the amount requested now.
UPDATE public.email_templates
SET body = E'Hi {{first_name}},\n\n' ||
  E'Thanks for accepting your {{event_name}} quote.\n\n' ||
  E'Your first payment request on invoice {{invoice_number}} is {{amount}}.\n\n' ||
  E'Invoice total: {{total_amount}}. Paid to date: {{paid_to_date}}. Remaining balance: {{remaining_balance}}.\n\n' ||
  E'Pay or download it here: {{invoice_link}}\n\n' ||
  E'View your order: {{order_url}}\n\n' ||
  E'Thanks,\n{{tenant_name}}'
WHERE company_id IS NULL
  AND template_type = 'deposit_invoice_issued';

UPDATE public.email_templates
SET body = E'Hi {{first_name}},\n\n' ||
  E'{{tenant_name}} sent a payment request for {{event_name}}. Amount due now: {{amount}}.\n\n' ||
  E'Invoice total: {{total_amount}}. Paid to date: {{paid_to_date}}. Remaining balance: {{remaining_balance}}.\n\n' ||
  E'Open the invoice: {{invoice_link}}\n\n' ||
  E'Thanks,\n{{tenant_name}}'
WHERE company_id IS NULL
  AND template_type = 'balance_invoice_issued';


-- Source: 20261003130000_sync_order_financials_from_invoice.sql
-- Keep order payment fields aligned for every invoice payment source:
-- PayFast, Yoco, Stripe, verified EFT, and admin-recorded payments.
-- Invoice amounts/status remain the payment ledger source of truth.
CREATE OR REPLACE FUNCTION public.sync_order_payment_projection_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_total numeric := 0;
  v_invoice_paid numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_deposit_amount numeric := 0;
  v_deposit_percent numeric := 0;
  v_company_deposit_percent numeric := 0;
  v_event_date date;
  v_deposit_target numeric := 0;
  v_deposit_met boolean := false;
  v_fully_paid boolean := false;
  v_old_deposit_paid_at timestamptz;
  v_old_balance_paid_at timestamptz;
  v_now timestamptz := now();
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT company_id, total_amount, deposit_amount, deposit_percentage,
         event_date, deposit_paid_at, balance_paid_at
    INTO v_company_id, v_total, v_deposit_amount, v_deposit_percent,
         v_event_date, v_old_deposit_paid_at, v_old_balance_paid_at
    FROM public.orders
   WHERE id = NEW.order_id
   FOR UPDATE;

  IF NOT FOUND OR v_company_id IS DISTINCT FROM NEW.company_id THEN
    RETURN NEW;
  END IF;

  SELECT deposit_percent
    INTO v_company_deposit_percent
    FROM public.companies
   WHERE id = v_company_id;

  v_total := GREATEST(COALESCE(v_total, NEW.total_amount, 0), 0);
  v_invoice_paid := GREATEST(COALESCE(NEW.amount_paid, 0), 0);
  v_paid := LEAST(v_total, v_invoice_paid);
  v_balance := GREATEST(0, round(v_total - v_paid, 2));
  v_fully_paid := v_balance <= 0.01;

  IF v_event_date IS NOT NULL AND v_event_date <= CURRENT_DATE THEN
    v_deposit_target := v_total;
  ELSIF COALESCE(v_deposit_amount, 0) > 0 THEN
    v_deposit_target := LEAST(v_total, v_deposit_amount);
  ELSE
    IF COALESCE(v_deposit_percent, 0) <= 0 OR v_deposit_percent >= 100 THEN
      v_deposit_percent := v_company_deposit_percent;
    END IF;
    IF COALESCE(v_deposit_percent, 0) <= 0 OR v_deposit_percent >= 100 THEN
      v_deposit_percent := 50;
    END IF;
    v_deposit_target := round(v_total * v_deposit_percent / 100, 2);
  END IF;

  v_deposit_met := v_deposit_target > 0
    AND round(v_paid * 100) >= round(v_deposit_target * 100);

  UPDATE public.orders
     SET amount_paid = v_paid,
         balance_amount = v_balance,
         payment_status = CASE
           WHEN v_fully_paid THEN 'paid'::public.payment_status
           WHEN v_paid > 0 THEN 'partial'::public.payment_status
           ELSE 'pending'::public.payment_status
         END,
         deposit_paid = v_deposit_met,
         deposit_paid_at = CASE
           WHEN v_deposit_met THEN COALESCE(v_old_deposit_paid_at, v_now)
           ELSE NULL
         END,
         balance_paid = v_fully_paid,
         balance_paid_at = CASE
           WHEN v_fully_paid THEN COALESCE(v_old_balance_paid_at, v_now)
           ELSE NULL
         END,
         updated_at = v_now
   WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_sync_order_payment_projection ON public.invoices;
CREATE TRIGGER invoices_sync_order_payment_projection
AFTER INSERT OR UPDATE OF total_amount, amount_paid, balance_due, status
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_payment_projection_from_invoice();

-- Repair existing live invoice/order pairs once so the order finance
-- panel starts from the same paid and outstanding figures as the invoice.
UPDATE public.invoices
   SET amount_paid = amount_paid
 WHERE order_id IS NOT NULL
   AND deleted_at IS NULL
   AND status IN ('draft', 'sent', 'overdue', 'partially_paid', 'paid');


-- Source: 20261003140000_atomic_payment_settlement.sql
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


-- Source: 20261003150000_payment_recovery_workers.sql
CREATE TABLE IF NOT EXISTS public.payfast_recovery_cursors (
  source_id uuid PRIMARY KEY,
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id),
  next_date date NOT NULL,
  page_offset integer NOT NULL DEFAULT 0,
  recent_offset integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payfast_recovery_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payfast_recovery_cursors FROM anon, authenticated;
GRANT ALL ON public.payfast_recovery_cursors TO service_role;

CREATE OR REPLACE FUNCTION public.claim_payment_receipts(p_limit integer DEFAULT 10)
RETURNS SETOF public.payment_receipt_outbox
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT id FROM public.payment_receipt_outbox
     WHERE delivered_at IS NULL AND (claimed_until IS NULL OR claimed_until < now())
     ORDER BY claimed_until NULLS FIRST, created_at LIMIT LEAST(GREATEST(p_limit, 1), 50)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.payment_receipt_outbox q SET claimed_until = now() + interval '5 minutes', attempts = attempts + 1
   FROM due WHERE q.id = due.id RETURNING q.*;
$$;

CREATE OR REPLACE FUNCTION public.deliver_payment_receipt_in_app(p_receipt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job public.payment_receipt_outbox%ROWTYPE;
  v_recipient uuid;
  v_client_user uuid;
  v_type text;
  v_title text;
  v_message text;
  v_admin boolean;
BEGIN
  SELECT * INTO v_job FROM public.payment_receipt_outbox WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF v_job.notified_at IS NOT NULL THEN RETURN; END IF;
  SELECT user_id INTO v_client_user FROM public.clients
    WHERE id = (v_job.payload->>'client_id')::uuid AND company_id = v_job.company_id;
  v_type := CASE v_job.kind WHEN 'received' THEN 'payment_received' WHEN 'claimed' THEN 'payment_claimed' ELSE 'payment_rejected' END;
  v_title := CASE v_job.kind WHEN 'received' THEN 'Payment received' WHEN 'claimed' THEN 'EFT needs verification' ELSE 'EFT could not be matched' END;
  v_message := concat(v_job.payload->>'currency', ' ', v_job.payload->>'amount', ' for ', v_job.payload->>'reference', '. ',
    CASE v_job.kind WHEN 'received' THEN 'Remaining balance: ' || COALESCE(v_job.payload->>'balance_due', '0')
      WHEN 'claimed' THEN 'Check the bank statement before confirming this claim.'
      ELSE COALESCE(v_job.payload->>'notes', 'Please check your reference and contact the company.') END);
  IF COALESCE((v_job.payload->>'overpayment_amount')::numeric, 0) > 0 AND v_job.kind = 'received' THEN
    v_message := v_message || '. Overpayment requires review: ' || (v_job.payload->>'overpayment_amount');
  END IF;
  FOR v_recipient, v_admin IN
    SELECT recipient, bool_or(is_admin) FROM (
      SELECT p.id AS recipient, true AS is_admin FROM public.profiles p
       WHERE p.company_id = v_job.company_id AND p.role::text IN ('owner', 'company_admin', 'admin', 'sales_admin', 'region_admin') AND v_job.kind <> 'rejected'
      UNION ALL SELECT owner_id, true FROM public.companies WHERE id = v_job.company_id AND owner_id IS NOT NULL AND v_job.kind <> 'rejected'
      UNION ALL SELECT v_client_user, false WHERE v_client_user IS NOT NULL AND v_job.kind <> 'claimed'
    ) recipients GROUP BY recipient
  LOOP
    INSERT INTO public.notifications (company_id, user_id, recipient_id, notification_type,
      title, message, priority, link, related_entity_type, related_entity_id, channels)
    VALUES (v_job.company_id, v_recipient, v_recipient, v_type, v_title, v_message,
      CASE WHEN v_job.kind = 'claimed' OR COALESCE((v_job.payload->>'overpayment_amount')::numeric, 0) > 0 THEN 'high' ELSE 'normal' END,
      CASE WHEN v_admin THEN '/admin/invoices?invoiceId=' || COALESCE(v_job.payload->>'invoice_id', '') || '&claimId=' || v_job.payment_id::text ELSE '/client-portal/billing' END,
      CASE WHEN v_job.payload->>'invoice_id' IS NULL THEN 'order' ELSE 'invoice' END,
      COALESCE((v_job.payload->>'invoice_id')::uuid, (v_job.payload->>'order_id')::uuid), ARRAY['in_app']);
  END LOOP;
  UPDATE public.payment_receipt_outbox SET notified_at = now() WHERE id = p_receipt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_payment_receipts(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deliver_payment_receipt_in_app(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_receipts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.deliver_payment_receipt_in_app(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';


-- Source: 20261003160000_checkout_gateway_credential_versions.sql
-- Secrets never enter payment_attempts (which tenants can read). Keep the
-- checkout's exact merchant/mode/key bundle in a service-only version store.
CREATE TABLE IF NOT EXISTS public.payment_gateway_credential_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  provider text NOT NULL,
  is_test boolean NOT NULL,
  credentials jsonb NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, fingerprint)
);
ALTER TABLE public.payment_gateway_credential_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_gateway_credential_versions FROM anon, authenticated;
GRANT ALL ON public.payment_gateway_credential_versions TO service_role;

CREATE OR REPLACE FUNCTION public.capture_checkout_gateway_credentials(
  p_gateway_id uuid, p_credentials jsonb, p_is_test boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gateway public.payment_gateways%ROWTYPE; v_id uuid; v_hash text;
BEGIN
  SELECT * INTO v_gateway FROM public.payment_gateways WHERE id = p_gateway_id;
  IF NOT FOUND OR p_credentials IS NULL OR p_is_test IS NULL THEN RAISE EXCEPTION 'Gateway unavailable'; END IF;
  v_hash := md5(p_credentials::text || ':' || p_is_test::text);
  INSERT INTO public.payment_gateway_credential_versions(gateway_id,company_id,provider,is_test,credentials,fingerprint)
    VALUES(p_gateway_id,v_gateway.company_id,v_gateway.provider,p_is_test,p_credentials,v_hash)
    ON CONFLICT (gateway_id,fingerprint) DO NOTHING;
  SELECT id INTO v_id FROM public.payment_gateway_credential_versions WHERE gateway_id = p_gateway_id AND fingerprint = v_hash;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_checkout_gateway_credentials(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_checkout_gateway_credentials(uuid,jsonb,boolean) TO service_role;

-- Capture current keys too, so existing attempts have a recovery source when
-- an owner changes the merchant account after this migration.
INSERT INTO public.payment_gateway_credential_versions(gateway_id,company_id,provider,is_test,credentials,fingerprint)
SELECT g.id,g.company_id,g.provider,g.is_test,c.credentials,md5(c.credentials::text || ':' || g.is_test::text)
  FROM public.payment_gateways g JOIN public.payment_gateway_credentials c ON c.gateway_id = g.id
ON CONFLICT (gateway_id,fingerprint) DO NOTHING;
NOTIFY pgrst, 'reload schema';


-- Source: 20261003170000_atomic_company_gateway_configuration.sql
-- Gateway mode/metadata/credentials must not be partially saved on a crash.
CREATE OR REPLACE FUNCTION public.configure_company_payment_gateway(
  p_company_id uuid, p_actor_id uuid, p_provider text, p_is_test boolean,
  p_credentials jsonb, p_success_url text DEFAULT NULL, p_cancel_url text DEFAULT NULL,
  p_notify_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gateway public.payment_gateways%ROWTYPE;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('payfast','yoco','stripe') OR p_is_test IS NULL
    OR p_credentials IS NULL OR jsonb_typeof(p_credentials) <> 'object' THEN RAISE EXCEPTION 'Invalid gateway configuration'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('company-gateway:' || p_company_id::text,0));
  SELECT * INTO v_gateway FROM public.payment_gateways WHERE company_id = p_company_id
    AND provider = p_provider AND deleted_at IS NULL FOR UPDATE;
  IF FOUND THEN
    UPDATE public.payment_gateways SET is_test = p_is_test, success_url = p_success_url,
      cancel_url = p_cancel_url, notify_url = p_notify_url, last_verified_at = NULL, updated_by_user_id = p_actor_id
      WHERE id = v_gateway.id RETURNING * INTO v_gateway;
  ELSE
    INSERT INTO public.payment_gateways(company_id,provider,is_active,is_test,success_url,cancel_url,notify_url,created_by_user_id,updated_by_user_id)
      VALUES(p_company_id,p_provider,false,p_is_test,p_success_url,p_cancel_url,p_notify_url,p_actor_id,p_actor_id)
      RETURNING * INTO v_gateway;
  END IF;
  INSERT INTO public.payment_gateway_credentials(gateway_id,credentials) VALUES(v_gateway.id,p_credentials)
    ON CONFLICT (gateway_id) DO UPDATE SET credentials = public.payment_gateway_credentials.credentials || EXCLUDED.credentials;
  RETURN to_jsonb(v_gateway);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_company_payment_gateway(p_company_id uuid,p_gateway_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gateway public.payment_gateways%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('company-gateway:' || p_company_id::text,0));
  SELECT * INTO v_gateway FROM public.payment_gateways WHERE id = p_gateway_id AND company_id = p_company_id
    AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gateway not found for this company'; END IF;
  UPDATE public.payment_gateways SET is_active = false, updated_by_user_id = p_actor_id
    WHERE company_id = p_company_id AND id <> p_gateway_id AND is_active IS TRUE;
  UPDATE public.payment_gateways SET is_active = true, updated_by_user_id = p_actor_id
    WHERE id = p_gateway_id RETURNING * INTO v_gateway;
  RETURN to_jsonb(v_gateway);
END;
$$;

-- One SQL snapshot avoids reading old metadata followed by newly rotated
-- keys in two separate HTTP requests while an owner saves configuration.
CREATE OR REPLACE FUNCTION public.read_payment_gateway_configuration(
  p_company_id uuid DEFAULT NULL,p_gateway_id uuid DEFAULT NULL,p_include_deleted boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('gateway',to_jsonb(g),'credentials',COALESCE(c.credentials,'{}'::jsonb))
    FROM public.payment_gateways g LEFT JOIN public.payment_gateway_credentials c ON c.gateway_id = g.id
   WHERE (p_company_id IS NULL OR g.company_id = p_company_id)
     AND (p_gateway_id IS NULL OR g.id = p_gateway_id)
     AND (p_include_deleted OR g.deleted_at IS NULL)
     AND (p_gateway_id IS NOT NULL OR g.is_active IS TRUE)
   ORDER BY g.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.configure_company_payment_gateway(uuid,uuid,text,boolean,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activate_company_payment_gateway(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.read_payment_gateway_configuration(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_company_payment_gateway(uuid,uuid,text,boolean,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_company_payment_gateway(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_payment_gateway_configuration(uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';


-- Source: 20261003180000_financial_write_permissions.sql
-- Close legacy FOR ALL company-membership policies: clients and operational
-- staff must not manufacture completed payments or activate merchant accounts.
-- RLS_OPT_OUT: policy/function changes only; no new tables.
CREATE OR REPLACE FUNCTION public.can_manage_company_payments(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND (p.role::text = 'super_admin' OR (
        p.company_id = p_company_id
        AND p.role::text IN ('owner','company_admin','admin','sales_admin','region_admin')
      ))
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_company_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_company_payments(uuid) TO authenticated, service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_access_payments ON public.payments;
DROP POLICY IF EXISTS payments_scoped_read ON public.payments;
CREATE POLICY payments_scoped_read ON public.payments FOR SELECT TO authenticated USING (
  public.can_manage_company_payments(company_id)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
             AND p.company_id = payments.company_id AND p.role::text <> 'client')
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = payments.client_id
             AND c.company_id = payments.company_id
             AND (c.user_id = (SELECT auth.uid()) OR lower(c.email) =
               (SELECT lower(p.email) FROM public.profiles p WHERE p.id = (SELECT auth.uid()))))
);
DROP POLICY IF EXISTS payments_finance_manage ON public.payments;
CREATE POLICY payments_finance_manage ON public.payments FOR ALL TO authenticated
  USING (public.can_manage_company_payments(company_id))
  WITH CHECK (public.can_manage_company_payments(company_id));

-- Restrictive policies also fence any permissive legacy policies remaining in
-- an existing deployment. Service-role settlement continues to bypass RLS.
DO $$ DECLARE v_table text; v_command text; v_name text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['payments','invoices','payment_gateways'] LOOP
    FOREACH v_command IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      v_name := v_table || '_financial_' || lower(v_command);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_name, v_table);
      IF v_command = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_manage_company_payments(company_id))', v_name, v_table);
      ELSIF v_command = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_manage_company_payments(company_id)) WITH CHECK (public.can_manage_company_payments(company_id))', v_name, v_table);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_manage_company_payments(company_id))', v_name, v_table);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DROP POLICY IF EXISTS payment_attempts_company_read ON public.payment_attempts;
CREATE POLICY payment_attempts_company_read ON public.payment_attempts FOR SELECT TO authenticated USING (
  public.can_manage_company_payments(company_id)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
             AND p.company_id = payment_attempts.company_id AND p.role::text <> 'client')
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = payment_attempts.client_id
             AND c.company_id = payment_attempts.company_id
             AND (c.user_id = (SELECT auth.uid()) OR lower(c.email) =
               (SELECT lower(p.email) FROM public.profiles p WHERE p.id = (SELECT auth.uid()))))
);


-- Source: 20261004090000_idempotent_store_credit_checkout.sql
-- A lost checkout response must not repeat a partial wallet debit.
CREATE TABLE IF NOT EXISTS public.payment_credit_redemptions (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  request_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  order_id uuid REFERENCES public.orders(id),
  requested_amount numeric NOT NULL CHECK (requested_amount > 0),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, request_id)
);
ALTER TABLE public.payment_credit_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_credit_redemptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_credit_redemptions TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_client_credit_once(
  p_company_id uuid,
  p_client_id uuid,
  p_invoice_id uuid,
  p_order_id uuid,
  p_requested_amount numeric,
  p_request_id uuid,
  p_created_by_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prior public.payment_credit_redemptions%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_request_id IS NULL OR p_company_id IS NULL OR p_client_id IS NULL OR p_invoice_id IS NULL
    OR p_requested_amount IS NULL OR p_requested_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_requested_amount <= 0 OR p_requested_amount <> round(p_requested_amount, 2) THEN
    RAISE EXCEPTION 'Invalid store credit checkout request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('credit-checkout:' || p_company_id::text || ':' || p_request_id::text, 0));
  SELECT * INTO v_prior FROM public.payment_credit_redemptions
    WHERE company_id = p_company_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.client_id IS DISTINCT FROM p_client_id OR v_prior.invoice_id IS DISTINCT FROM p_invoice_id
      OR v_prior.order_id IS DISTINCT FROM p_order_id OR v_prior.requested_amount IS DISTINCT FROM p_requested_amount THEN
      RAISE EXCEPTION 'Store credit checkout request reused with different details' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result || jsonb_build_object('replayed', true);
  END IF;

  -- The existing wallet lock, debit, ledger and invoice projection run in
  -- this same transaction as the replay record. A failed write rolls back all.
  v_result := public.redeem_client_credit(p_company_id, p_client_id, p_invoice_id,
    p_order_id, p_requested_amount, p_created_by_user_id);
  IF v_result ? 'error' THEN
    RAISE EXCEPTION 'Store credit redemption rejected: %', v_result->>'error' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.payment_credit_redemptions(company_id, request_id, client_id, invoice_id, order_id, requested_amount, result)
    VALUES(p_company_id, p_request_id, p_client_id, p_invoice_id, p_order_id, p_requested_amount, v_result);
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.redeem_client_credit_once(uuid, uuid, uuid, uuid, numeric, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_client_credit_once(uuid, uuid, uuid, uuid, numeric, uuid, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';


-- Source: 20261004100000_refund_reconciliation_and_receipts.sql
-- Refund confirmation and its receipt must survive a process crash together.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_original_payment_id uuid REFERENCES public.payments(id),
  ADD COLUMN IF NOT EXISTS refund_provider_reference text;

ALTER TABLE public.payment_receipt_outbox DROP CONSTRAINT IF EXISTS payment_receipt_outbox_kind_check;
ALTER TABLE public.payment_receipt_outbox ADD CONSTRAINT payment_receipt_outbox_kind_check
  CHECK (kind IN ('received', 'claimed', 'rejected', 'refunded'));

CREATE OR REPLACE FUNCTION public.queue_completed_refund_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_type = 'refund' AND NEW.payment_status::text = 'completed'
    AND (TG_OP = 'INSERT' OR OLD.payment_status::text IS DISTINCT FROM 'completed') THEN
    PERFORM public.queue_payment_receipt(NEW.id, 'refunded');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_queue_completed_refund_receipt ON public.payments;
CREATE TRIGGER zz_queue_completed_refund_receipt AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.queue_completed_refund_receipt();
REVOKE ALL ON FUNCTION public.queue_completed_refund_receipt() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.refund_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  actor_user_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('paid', 'failed')),
  provider_reference text NOT NULL,
  evidence text NOT NULL,
  operation_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, provider_reference)
);
ALTER TABLE public.refund_reconciliation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refund_reconciliation_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.refund_reconciliation_events TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_company_refund(
  p_payment_id uuid, p_company_id uuid, p_actor_user_id uuid,
  p_outcome text, p_provider_reference text, p_evidence text,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_prior public.refund_reconciliation_events%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_actor_user_id;
  IF NOT FOUND OR v_profile.role::text NOT IN ('super_admin','owner','company_admin','admin')
    OR (v_profile.role::text <> 'super_admin' AND v_profile.company_id IS DISTINCT FROM p_company_id) THEN
    RAISE EXCEPTION 'Refund reconciliation permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('paid','failed') OR p_provider_reference IS NULL
    OR length(trim(p_provider_reference)) NOT BETWEEN 3 AND 255 OR p_evidence IS NULL
    OR length(trim(p_evidence)) NOT BETWEEN 10 AND 2000 OR p_paid_at IS NULL OR p_paid_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'A verified provider reference and reconciliation evidence are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.company_id IS DISTINCT FROM p_company_id OR v_payment.payment_type IS DISTINCT FROM 'refund' THEN
    RAISE EXCEPTION 'Refund does not match company' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_prior FROM public.refund_reconciliation_events
    WHERE payment_id = p_payment_id AND provider_reference = trim(p_provider_reference);
  IF FOUND THEN
    IF v_prior.outcome IS DISTINCT FROM p_outcome OR v_prior.operation_started_at IS DISTINCT FROM v_payment.refund_requested_at THEN
      RAISE EXCEPTION 'This evidence was used for a different refund action' USING ERRCODE = '55000';
    END IF;
    RETURN jsonb_build_object('duplicate', true, 'payment_id', p_payment_id, 'payment_status', v_payment.payment_status);
  END IF;
  IF v_payment.payment_status::text = 'completed' AND p_outcome = 'paid' THEN
    RETURN jsonb_build_object('duplicate', true, 'payment_id', p_payment_id, 'payment_status', 'completed');
  END IF;
  IF v_payment.payment_status::text <> 'processing' THEN
    RAISE EXCEPTION 'Only an unresolved processing refund can be reconciled' USING ERRCODE = '55000';
  END IF;
  IF v_payment.refund_requested_at > now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'Refund request may still be running. Wait and check the merchant records' USING ERRCODE = '55000';
  END IF;
  IF p_outcome = 'failed' AND v_payment.refund_requested_at IS NULL THEN
    RAISE EXCEPTION 'Legacy refund has no operation time. Provider failure must be reviewed by a database operator' USING ERRCODE = '55000';
  END IF;
  IF v_payment.amount <= 0 THEN RAISE EXCEPTION 'Invalid refund amount' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.refund_reconciliation_events(company_id,payment_id,actor_user_id,outcome,provider_reference,evidence,operation_started_at)
    VALUES(p_company_id,p_payment_id,p_actor_user_id,p_outcome,trim(p_provider_reference),trim(p_evidence),v_payment.refund_requested_at);
  UPDATE public.payments SET
    payment_status = CASE p_outcome WHEN 'paid' THEN 'completed'::public.payment_status ELSE 'pending'::public.payment_status END,
    processed_at = CASE WHEN p_outcome = 'paid' THEN p_paid_at ELSE processed_at END,
    refunded_at = CASE WHEN p_outcome = 'paid' THEN p_paid_at ELSE refunded_at END,
    refund_provider_reference = trim(p_provider_reference)
    WHERE id = p_payment_id;
  INSERT INTO public.audit_logs(company_id,user_id,action,entity_type,entity_id,details)
    VALUES(p_company_id,p_actor_user_id,'refund_reconciled','payment',p_payment_id,
      jsonb_build_object('outcome',p_outcome,'provider_reference',trim(p_provider_reference),'operation_started_at',v_payment.refund_requested_at));
  RETURN jsonb_build_object('duplicate', false, 'payment_id', p_payment_id,
    'payment_status', CASE p_outcome WHEN 'paid' THEN 'completed' ELSE 'pending' END);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_company_refund(uuid,uuid,uuid,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_company_refund(uuid,uuid,uuid,text,text,text,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.deliver_payment_receipt_in_app(p_receipt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job public.payment_receipt_outbox%ROWTYPE;
  v_recipient uuid;
  v_client_user uuid;
  v_type text;
  v_title text;
  v_message text;
  v_admin boolean;
BEGIN
  SELECT * INTO v_job FROM public.payment_receipt_outbox WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF v_job.notified_at IS NOT NULL THEN RETURN; END IF;
  SELECT user_id INTO v_client_user FROM public.clients
    WHERE id = (v_job.payload->>'client_id')::uuid AND company_id = v_job.company_id;
  v_type := CASE v_job.kind WHEN 'received' THEN 'payment_received' WHEN 'claimed' THEN 'payment_claimed' WHEN 'refunded' THEN 'payment_received' ELSE 'payment_rejected' END;
  v_title := CASE v_job.kind WHEN 'received' THEN 'Payment received' WHEN 'claimed' THEN 'EFT needs verification' WHEN 'refunded' THEN 'Refund processed' ELSE 'EFT could not be matched' END;
  v_message := concat(v_job.payload->>'currency', ' ', v_job.payload->>'amount', ' for ', v_job.payload->>'reference', '. ',
    CASE v_job.kind WHEN 'received' THEN 'Remaining balance: ' || COALESCE(v_job.payload->>'balance_due', '0')
      WHEN 'claimed' THEN 'Check the bank statement before confirming this claim.'
      WHEN 'refunded' THEN 'Refund recorded. Your bank or provider may take time to reflect the funds.'
      ELSE COALESCE(v_job.payload->>'notes', 'Please check your reference and contact the company.') END);
  IF COALESCE((v_job.payload->>'overpayment_amount')::numeric, 0) > 0 AND v_job.kind = 'received' THEN
    v_message := v_message || '. Overpayment requires review: ' || (v_job.payload->>'overpayment_amount');
  END IF;
  FOR v_recipient, v_admin IN
    SELECT recipient, bool_or(is_admin) FROM (
      SELECT p.id AS recipient, true AS is_admin FROM public.profiles p
       WHERE p.company_id = v_job.company_id AND p.role::text IN ('owner', 'company_admin', 'admin', 'sales_admin', 'region_admin') AND v_job.kind <> 'rejected'
      UNION ALL SELECT owner_id, true FROM public.companies WHERE id = v_job.company_id AND owner_id IS NOT NULL AND v_job.kind <> 'rejected'
      UNION ALL SELECT v_client_user, false WHERE v_client_user IS NOT NULL AND v_job.kind <> 'claimed'
    ) recipients GROUP BY recipient
  LOOP
    INSERT INTO public.notifications (company_id, user_id, recipient_id, notification_type,
      title, message, priority, link, related_entity_type, related_entity_id, channels)
    VALUES (v_job.company_id, v_recipient, v_recipient, v_type, v_title, v_message,
      CASE WHEN v_job.kind = 'claimed' OR COALESCE((v_job.payload->>'overpayment_amount')::numeric, 0) > 0 THEN 'high' ELSE 'normal' END,
      CASE WHEN v_admin AND v_job.kind = 'refunded' THEN '/admin/refunds?paymentId=' || v_job.payment_id::text
      WHEN v_admin THEN '/admin/invoices?invoiceId=' || COALESCE(v_job.payload->>'invoice_id', '') || '&claimId=' || v_job.payment_id::text ELSE '/client-portal/billing' END,
      CASE WHEN v_job.payload->>'invoice_id' IS NULL THEN 'order' ELSE 'invoice' END,
      COALESCE((v_job.payload->>'invoice_id')::uuid, (v_job.payload->>'order_id')::uuid), ARRAY['in_app']);
  END LOOP;
  UPDATE public.payment_receipt_outbox SET notified_at = now() WHERE id = p_receipt_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
