-- Quote-acceptance email flow (client brief, Oct 2026).
--
--   Quote accepted  -> deposit invoice email only, with NO order link.
--                      The order link goes out once the deposit is paid.
--   Deposit paid    -> thanks, booking locked in, order link, no invoice
--                      link; the invoice is in the client portal.
--   Balance paid    -> thanks, order link, no invoice link; the updated
--                      invoice downloads from the client portal.
--
-- Updates the shared (global) defaults only. Company-customised rows
-- (company_id IS NOT NULL) are untouched; emailService applies the same
-- link rules to them at send time. Reverses the order link added to the
-- deposit invoice by 20260725130000_deposit_invoice_order_link.sql.
-- Matches src/lib/messageTemplates/registry.ts.

UPDATE public.email_templates
SET body = E'Hi {{first_name}},\n\n' ||
  E'Thanks for accepting your {{event_name}} quote.\n\n' ||
  E'Your first payment request on invoice {{invoice_number}} is {{amount}}.\n\n' ||
  E'Invoice total: {{total_amount}}. Paid to date: {{paid_to_date}}. Remaining balance: {{remaining_balance}}.\n\n' ||
  E'Pay or download it here: {{invoice_link}}\n\n' ||
  E'Once the payment clears, your event date is locked in and we''ll email you a link to your order.\n\n' ||
  E'Thanks,\n{{tenant_name}}',
  updated_at = now()
WHERE company_id IS NULL
  AND template_type = 'deposit_invoice_issued';

UPDATE public.email_templates
SET body = E'Hi {{first_name}},\n\n' ||
  E'Thanks for your deposit of {{amount_formatted}} for {{event_name}}. Reference: {{invoice_number}}.\n\n' ||
  E'Your booking is locked in for your event date.\n\n' ||
  E'View your order: {{order_url}}\n\n' ||
  E'Your invoice is in the client portal: open your order to view and download it.\n\n' ||
  E'Thanks,\n{{tenant_name}}',
  updated_at = now()
WHERE company_id IS NULL
  AND template_type = 'deposit_payment_received';

UPDATE public.email_templates
SET body = E'Hi {{first_name}},\n\n' ||
  E'Thanks for your payment of {{amount_formatted}} against invoice {{invoice_number}}.\n\n' ||
  E'View your order: {{order_url}}\n\n' ||
  E'You can download your updated invoice from the client portal when you open your order.\n\n' ||
  E'Thanks,\n{{tenant_name}}',
  updated_at = now()
WHERE company_id IS NULL
  AND template_type = 'balance_payment_received';
