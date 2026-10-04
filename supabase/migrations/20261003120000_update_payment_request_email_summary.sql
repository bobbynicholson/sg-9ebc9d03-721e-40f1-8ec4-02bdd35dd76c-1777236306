-- Make the global invoice emails state the contract total, paid amount,
-- and current outstanding balance alongside the amount requested now.
UPDATE public.email_templates
SET body = E'Hi {{first_name}},\n\n' ||
  E'Thanks for accepting your {{event_name}} quote.\n\n' ||
  E'Your first payment request on invoice {{invoice_number}} is {{amount}}.\n\n' ||
  E'Invoice total: {{total_amount}}. Paid to date: {{paid_to_date}}. Remaining balance: {{remaining_balance}}.\n\n' ||
  E'Pay or download it here: {{invoice_link}}\n\n' ||
  E'View your order: {{order_url}}\n\n' ||
  E'Thanks,\n{{tenant_name}}'
WHERE company_id IS NULL
  AND template_type = 'deposit_invoice_issued';

UPDATE public.email_templates
SET body = E'Hi {{first_name}},\n\n' ||
  E'{{tenant_name}} sent a payment request for {{event_name}}. Amount due now: {{amount}}.\n\n' ||
  E'Invoice total: {{total_amount}}. Paid to date: {{paid_to_date}}. Remaining balance: {{remaining_balance}}.\n\n' ||
  E'Open the invoice: {{invoice_link}}\n\n' ||
  E'Thanks,\n{{tenant_name}}'
WHERE company_id IS NULL
  AND template_type = 'balance_invoice_issued';
