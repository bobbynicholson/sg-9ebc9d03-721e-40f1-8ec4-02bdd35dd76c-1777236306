-- Read-only check for R1 payment rows from the last 7 days for this customer.
-- This does not create an order, send an email, or charge a payment.
SELECT
  p.id AS payment_id,
  p.payment_reference,
  o.order_number,
  cl.client_name,
  cl.email AS customer_email,
  p.amount,
  p.currency,
  p.payment_method,
  p.payment_status,
  p.gateway_provider,
  p.gateway_transaction_id,
  p.created_at
FROM public.payments AS p
JOIN public.companies AS c ON c.id = p.company_id
LEFT JOIN public.orders AS o ON o.id = p.order_id
LEFT JOIN public.clients AS cl ON cl.id = p.client_id
WHERE c.company_name ILIKE '%Spit Braai Delivery%'
  AND cl.email ILIKE 'rajm267744@gmail.com'
  AND p.amount = 1.00
  AND p.created_at >= now() - interval '7 days'
ORDER BY p.created_at DESC;

-- Read-only lookup for this customer's quote URL and any linked invoice payment page.
-- This returns links; it does not send an email or create a checkout session.
SELECT
  c.company_name,
  q.quote_number,
  COALESCE(cl.email, l.email) AS recipient_email,
  'https://cateringms.com'
    || COALESCE('/' || NULLIF(c.slug, ''), '')
    || '/q/' || q.public_token::text AS quote_url,
  i.invoice_number,
  CASE WHEN i.public_token IS NOT NULL THEN
    'https://cateringms.com'
      || COALESCE('/' || NULLIF(c.slug, ''), '')
      || '/pay/i/' || i.public_token::text
  END AS invoice_payment_url
FROM public.quotes AS q
JOIN public.companies AS c ON c.id = q.company_id
LEFT JOIN public.clients AS cl ON cl.id = q.client_id
LEFT JOIN public.leads AS l ON l.id = q.lead_id
LEFT JOIN LATERAL (
  SELECT inv.invoice_number, inv.public_token
  FROM public.invoices AS inv
  WHERE inv.order_id = q.converted_to_order_id
    AND inv.deleted_at IS NULL
  ORDER BY inv.created_at DESC
  LIMIT 1
) AS i ON TRUE
WHERE c.slug = 'spit-braai-delivery'
  AND q.quote_number = 'QUO-000115'
  AND COALESCE(cl.email, l.email) ILIKE 'rajm267744@gmail.com'
  AND q.deleted_at IS NULL;
