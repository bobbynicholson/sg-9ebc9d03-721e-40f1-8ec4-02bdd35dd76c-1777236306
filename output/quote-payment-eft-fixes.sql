-- Quote acceptance and EFT review fixes.
-- Run this only after the earlier payment schema migrations have been applied.
-- Apply in order: quote opening-paid fix, then EFT proof/confirmation guard.
-- Quote conversion passes every orders column through jsonb_populate_record.
-- Missing JSON keys therefore become explicit NULLs and bypass the column
-- DEFAULT, which previously made quote acceptance fail after
-- payment_opening_paid became NOT NULL.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_opening_paid numeric(12,2);

UPDATE public.orders
SET payment_opening_paid = 0
WHERE payment_opening_paid IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN payment_opening_paid SET DEFAULT 0,
  ALTER COLUMN payment_opening_paid SET NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_order_opening_paid_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.payment_opening_paid := COALESCE(NEW.payment_opening_paid, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_opening_paid_default ON public.orders;
CREATE TRIGGER orders_opening_paid_default
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_order_opening_paid_default();

COMMIT;

-- EFT claims require an uploaded proof before a company admin can confirm
-- them. Vision screening is stored as review guidance only; it never posts
-- a payment or marks an invoice paid.
BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_proof_ai_assessment jsonb,
  ADD COLUMN IF NOT EXISTS payment_proof_ai_analyzed_at timestamptz;

CREATE OR REPLACE FUNCTION public.verify_eft_payment_claim(
  p_payment_id uuid, p_company_id uuid, p_action text, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_duplicate boolean;
  v_totals jsonb := '{}'::jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('confirm', 'reject') THEN
    RAISE EXCEPTION 'Invalid action' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_payment.company_id IS DISTINCT FROM p_company_id OR v_payment.invoice_id IS NULL
    OR v_payment.payment_method::text <> 'eft' OR v_payment.gateway_provider IS NOT NULL THEN
    RAISE EXCEPTION 'Not an EFT claim for this company' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.company_id IS DISTINCT FROM p_company_id OR v_invoice.deleted_at IS NOT NULL
    OR v_invoice.client_id IS DISTINCT FROM v_payment.client_id
    OR v_invoice.order_id IS DISTINCT FROM v_payment.order_id THEN
    RAISE EXCEPTION 'EFT invoice mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  v_duplicate := (p_action = 'confirm' AND v_payment.payment_status::text = 'completed')
    OR (p_action = 'reject' AND v_payment.payment_status::text = 'failed');
  IF NOT v_duplicate AND v_payment.payment_status::text <> 'pending' THEN
    RAISE EXCEPTION 'Claim already resolved by a different action' USING ERRCODE = '23505';
  END IF;
  IF NOT v_duplicate AND p_action = 'confirm' AND NULLIF(v_payment.payment_proof_path, '') IS NULL THEN
    RAISE EXCEPTION 'Payment proof is required before confirming an EFT claim' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'confirm' THEN
    IF v_payment.amount <= 0 THEN RAISE EXCEPTION 'Invalid EFT amount' USING ERRCODE = '22023'; END IF;
    UPDATE public.payments SET payment_status = 'completed', processed_at = COALESCE(processed_at, now()),
      completed_at = COALESCE(completed_at, now()) WHERE id = p_payment_id;
    v_totals := public.refresh_invoice_payment_totals(v_invoice.id,
      COALESCE(v_invoice.amount_paid, 0) + CASE WHEN v_duplicate THEN 0 ELSE v_payment.amount END);
  ELSIF NOT v_duplicate THEN
    UPDATE public.payments SET payment_status = 'failed', failed_at = now(),
      notes = concat_ws(E'\n', notes, 'Rejected by admin: ' || COALESCE(left(p_reason, 500), 'Not matched'))
      WHERE id = p_payment_id;
  END IF;
  PERFORM public.queue_payment_receipt(p_payment_id, CASE WHEN p_action = 'confirm' THEN 'received' ELSE 'rejected' END);
  RETURN v_totals || jsonb_build_object('payment_id', p_payment_id, 'duplicate', v_duplicate,
    'action', CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'rejected' END,
    'order_closed', false, 'order_id', v_invoice.order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_eft_payment_claim(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_eft_payment_claim(uuid, uuid, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
