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
