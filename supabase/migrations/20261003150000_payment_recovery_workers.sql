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
