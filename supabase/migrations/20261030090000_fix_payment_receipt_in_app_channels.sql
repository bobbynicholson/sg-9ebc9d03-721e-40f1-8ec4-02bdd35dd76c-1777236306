-- Fix: online (PayFast/Yoco/Stripe) payment receipts were never delivered.
--
-- deliver_payment_receipt_in_app inserted ARRAY['in_app'] (text[]) into
-- notifications.channels, which is notification_channel[]. Postgres does not
-- cast a text array to an enum array implicitly, so every call failed with
-- 'column "channels" is of type notification_channel[] but expression is of
-- type text[]'. The receipt worker runs this step first, so neither the
-- in-app notifications nor the client/owner receipt emails were ever sent
-- (seen on INV-005675; every gateway receipt since 2026-10-08 is stuck).
--
-- Only change from 20261004100000: the explicit ::notification_channel[] cast.
-- Function signature and behaviour are otherwise identical.
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
      COALESCE((v_job.payload->>'invoice_id')::uuid, (v_job.payload->>'order_id')::uuid),
      ARRAY['in_app']::public.notification_channel[]);
  END LOOP;
  UPDATE public.payment_receipt_outbox SET notified_at = now() WHERE id = p_receipt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.deliver_payment_receipt_in_app(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_payment_receipt_in_app(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
