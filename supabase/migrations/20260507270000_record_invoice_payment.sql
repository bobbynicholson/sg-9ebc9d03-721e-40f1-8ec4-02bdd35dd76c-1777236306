-- P2F-1: atomic record_invoice_payment RPC
--
-- The PayFast webhook's invoice-payment branch did three sequential
-- writes: update invoices.status='paid', insert into payments, update
-- orders.status='completed'. A network blip between any two of those
-- left the system in an inconsistent state -- invoice paid + payments
-- recorded but order still showing pending, or invoice paid but
-- payments not recorded.
--
-- Phase 1 P0-10 introduced record_order_payment for the order branch.
-- This migration is the matching RPC for the invoice branch: all three
-- writes happen in one transaction.

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_transaction_id text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_currency text DEFAULT 'ZAR',
  p_gateway_provider text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_payment_id uuid;
  v_new_payment_id uuid;
  v_invoice RECORD;
  v_order_completed boolean := false;
BEGIN
  -- Belt-and-braces idempotency: if this gateway transaction has
  -- already been recorded, return the existing payment + invoice
  -- without re-doing the writes.
  IF p_transaction_id IS NOT NULL THEN
    SELECT id
      INTO v_existing_payment_id
      FROM public.payments
     WHERE invoice_id = p_invoice_id
       AND (gateway_transaction_id = p_transaction_id OR transaction_id = p_transaction_id)
     LIMIT 1;
    IF v_existing_payment_id IS NOT NULL THEN
      SELECT id, order_id, invoice_number, status, total_amount, client_id, company_id
        INTO v_invoice
        FROM public.invoices
       WHERE id = p_invoice_id;
      RETURN jsonb_build_object(
        'idempotent', true,
        'payment_id', v_existing_payment_id,
        'invoice_id', v_invoice.id,
        'order_id', v_invoice.order_id,
        'invoice_number', v_invoice.invoice_number,
        'invoice_status', v_invoice.status::text
      );
    END IF;
  END IF;

  -- Step 1: insert the payment row.
  INSERT INTO public.payments (
    invoice_id, amount, payment_method,
    gateway_transaction_id, transaction_id, payment_reference,
    payment_status, processed_at, completed_at, created_at,
    company_id, client_id, currency, gateway, gateway_provider
  )
  VALUES (
    p_invoice_id, p_amount, p_payment_method,
    p_transaction_id, p_transaction_id, p_transaction_id,
    'completed', now(), now(), now(),
    p_company_id, p_client_id, p_currency, p_gateway_provider, p_gateway_provider
  )
  RETURNING id INTO v_new_payment_id;

  -- Step 2: update the invoice. P0-09 triggers will recompute totals
  -- automatically when the payment row lands; we still want to surface
  -- the canonical "paid" status here for callers that read
  -- invoice.status directly (e.g. the public pay link).
  UPDATE public.invoices
     SET status = 'paid'::public.invoice_status,
         amount_paid = p_amount,
         balance_due = 0,
         updated_at = now()
   WHERE id = p_invoice_id
  RETURNING id, order_id, invoice_number, status, total_amount, client_id, company_id
    INTO v_invoice;

  -- Step 3: close the source order if any. Same status the previous
  -- inline pattern wrote, but in the same transaction.
  IF v_invoice.order_id IS NOT NULL THEN
    UPDATE public.orders
       SET status = 'completed'::public.order_status,
           payment_status = 'paid'::public.payment_status,
           updated_at = now()
     WHERE id = v_invoice.order_id;
    v_order_completed := true;
  END IF;

  RETURN jsonb_build_object(
    'idempotent', false,
    'payment_id', v_new_payment_id,
    'invoice_id', v_invoice.id,
    'order_id', v_invoice.order_id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status::text,
    'order_completed', v_order_completed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(
  uuid, numeric, text, text, uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_invoice_payment(
  uuid, numeric, text, text, uuid, uuid, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.record_invoice_payment(
  uuid, numeric, text, text, uuid, uuid, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(
  uuid, numeric, text, text, uuid, uuid, text, text
) TO service_role;
