-- Acceptance confirmation must include both the deposit invoice and the
-- resulting order. Runtime code also enforces the secure order link for
-- legacy/custom templates; this migration updates the editable global
-- default so operators see the same wording in Settings.

UPDATE public.email_templates
SET body =
  regexp_replace(
    body,
    '(Pay or download it here: \{\{invoice_link\}\}|Open the invoice: \{\{invoice_link\}\})',
    E'\\1\n\nView your order: {{order_url}}'
  ),
  updated_at = now()
WHERE company_id IS NULL
  AND template_type = 'deposit_invoice_issued'
  AND body NOT LIKE '%{{order_url}}%';
