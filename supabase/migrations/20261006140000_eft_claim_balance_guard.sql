-- The HTTP handler checks the amount before it calls this function, but a
-- gateway payment can settle between that check and this transaction. Check
-- again while the invoice row is locked so a stale EFT claim cannot exceed
-- the remaining balance.
BEGIN;

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
    OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'Invalid EFT amount' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.company_id IS DISTINCT FROM p_company_id OR v_invoice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '22023';
  END IF;
  IF v_invoice.status::text IN ('paid', 'cancelled', 'void', 'written_off') OR v_invoice.balance_due <= 0 THEN
    RAISE EXCEPTION 'Invoice cannot receive a new EFT claim' USING ERRCODE = '22023';
  END IF;
  IF p_amount > round(COALESCE(v_invoice.balance_due, 0), 2) THEN
    RAISE EXCEPTION 'EFT claim exceeds the remaining invoice balance' USING ERRCODE = '22023';
  END IF;
  IF p_proof_path IS NOT NULL AND p_proof_path NOT LIKE p_company_id::text || '/' || p_invoice_id::text || '/%' THEN
    RAISE EXCEPTION 'Proof path mismatch' USING ERRCODE = '22023';
  END IF;

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

REVOKE ALL ON FUNCTION public.create_eft_payment_claim(uuid, uuid, numeric, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_eft_payment_claim(uuid, uuid, numeric, timestamptz, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
