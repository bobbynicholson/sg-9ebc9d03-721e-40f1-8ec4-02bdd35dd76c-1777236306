-- Read-only diagnostic for the recent RJ wedding invoices.
-- Run this in the Supabase SQL editor. It never reads gateway secrets.

-- Checkout attempts are inserted before the browser is sent to PayFast.
SELECT
  i.invoice_number,
  i.id AS invoice_id,
  i.total_amount AS invoice_total,
  i.amount_paid AS invoice_paid,
  i.balance_due AS invoice_balance,
  a.id AS payment_attempt_id,
  a.provider,
  a.status AS attempt_status,
  a.provider_status,
  a.failure_reason,
  a.amount AS attempted_amount,
  a.currency AS attempted_currency,
  a.provider_session_id,
  a.metadata ->> 'gatewayIsTest' AS gateway_is_test,
  a.created_at AS attempt_created_at
FROM public.invoices AS i
LEFT JOIN public.payment_attempts AS a
  ON a.invoice_id = i.id
 AND a.provider = 'payfast'
WHERE i.invoice_number IN ('INV-005598', 'INV-005599')
ORDER BY i.invoice_number, a.created_at DESC NULLS LAST;

-- A payments row is written only after a verified provider callback settles.
-- Includes any older payment rows linked through the order instead of invoice_id.
SELECT
  i.invoice_number,
  i.id AS invoice_id,
  p.id AS payment_id,
  p.payment_method,
  p.payment_status,
  p.amount,
  p.currency,
  p.gateway_provider,
  p.gateway_transaction_id,
  p.payment_reference,
  p.created_at AS payment_created_at
FROM public.invoices AS i
LEFT JOIN public.payments AS p
  ON p.invoice_id = i.id
  OR (i.order_id IS NOT NULL AND p.order_id = i.order_id)
WHERE i.invoice_number IN ('INV-005598', 'INV-005599')
ORDER BY i.invoice_number, p.created_at DESC NULLS LAST;

-- How to read the results:
-- * An attempt with status 'pending' and no PayFast payment row means the app
--   saved the checkout, but PayFast has not sent a verified success callback.
--   A signature rejection at /eng/process happens before a payment completes.
-- * No attempt row means checkout did not reach the attempt-insert step (or
--   the invoice number is different); check the app/API logs for that request.
-- * A succeeded attempt and a completed payment row mean the gateway callback
--   was verified and saved.
