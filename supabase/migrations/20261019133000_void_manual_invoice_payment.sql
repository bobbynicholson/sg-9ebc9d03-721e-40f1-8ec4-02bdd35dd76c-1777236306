-- A mistaken manual payment must be reversible without deleting its ledger
-- record. This is intentionally limited to manual entries: gateway payments
-- must be refunded or reconciled through their provider workflow.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE OR REPLACE FUNCTION public.void_manual_invoice_payment(
  p_payment_id uuid, p_company_id uuid, p_actor_user_id uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
BEGIN
  IF p_payment_id IS NULL OR p_company_id IS NULL OR p_actor_user_id IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Payment, company, operator, and a reversal reason are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Payment not found for this company' USING ERRCODE = '42501';
  END IF;
  IF v_payment.payment_status::text = 'voided' THEN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id;
    RETURN jsonb_build_object('idempotent', true, 'payment_id', v_payment.id, 'invoice_id', v_payment.invoice_id,
      'amount_paid', coalesce(v_invoice.amount_paid, 0), 'balance_due', coalesce(v_invoice.balance_due, 0), 'invoice_status', v_invoice.status::text);
  END IF;
  IF v_payment.payment_status::text NOT IN ('completed', 'paid', 'succeeded') THEN
    RAISE EXCEPTION 'Only a completed payment can be reversed' USING ERRCODE = '55000';
  END IF;
  IF coalesce(v_payment.gateway_provider, '') <> 'manual' OR v_payment.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Only manual invoice payments can be reversed here' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found for this payment' USING ERRCODE = '22023'; END IF;

  UPDATE public.payments SET payment_status = 'voided'::public.payment_status, voided_at = now(),
    voided_by_user_id = p_actor_user_id, void_reason = v_reason, updated_at = now() WHERE id = v_payment.id;
  PERFORM public.recalc_invoice_totals(v_invoice.id);
  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id;
  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_company_id, p_actor_user_id, 'invoice_manual_payment_voided', 'payment', v_payment.id,
    jsonb_build_object('invoice_id', v_invoice.id, 'invoice_number', v_invoice.invoice_number, 'amount', v_payment.amount,
      'currency', v_payment.currency, 'payment_reference', v_payment.payment_reference, 'reason', v_reason));
  RETURN jsonb_build_object('idempotent', false, 'payment_id', v_payment.id, 'invoice_id', v_invoice.id,
    'amount_paid', v_invoice.amount_paid, 'balance_due', v_invoice.balance_due, 'invoice_status', v_invoice.status::text);
END;
$function$;

REVOKE ALL ON FUNCTION public.void_manual_invoice_payment(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_manual_invoice_payment(uuid, uuid, uuid, text) TO service_role;
NOTIFY pgrst, 'reload schema';
