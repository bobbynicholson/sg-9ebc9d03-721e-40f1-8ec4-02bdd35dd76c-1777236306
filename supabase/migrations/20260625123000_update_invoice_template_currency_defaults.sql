-- Keep global invoice email defaults aligned with the app registry:
-- use preformatted {{amount}} and the public invoice link instead of
-- hardcoded ZAR prefixes. Tenant-specific overrides are left untouched.

UPDATE public.email_templates
SET
  subject = 'Deposit invoice {{invoice_number}} - {{event_name}}',
  body = E'Hi {{first_name}},\n\n' ||
    E'{{tenant_name}} issued the deposit invoice {{invoice_number}} for {{event_name}}. Deposit due: {{amount}}.\n\n' ||
    E'Open the invoice: {{invoice_link}}\n\n' ||
    E'Once the payment clears, your event date is locked in.\n\n' ||
    E'Thanks,\n{{tenant_name}}'
WHERE company_id IS NULL
  AND template_type = 'deposit_invoice_issued';

UPDATE public.email_templates
SET
  subject = 'Balance invoice {{invoice_number}} - {{event_name}}',
  body = E'Hi {{first_name}},\n\n' ||
    E'{{tenant_name}} issued the balance invoice {{invoice_number}} for {{event_name}}. Balance due: {{amount}}.\n\n' ||
    E'Open the invoice: {{invoice_link}}\n\n' ||
    E'Thanks,\n{{tenant_name}}'
WHERE company_id IS NULL
  AND template_type = 'balance_invoice_issued';
