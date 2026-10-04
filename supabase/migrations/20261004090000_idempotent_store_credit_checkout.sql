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
