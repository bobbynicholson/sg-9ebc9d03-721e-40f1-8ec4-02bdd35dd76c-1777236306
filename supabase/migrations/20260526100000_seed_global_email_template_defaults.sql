-- ODOC H.15: seed platform-default email_templates rows for the
-- two transactional templates that were missing global defaults.
--
-- emailService.sendEmail (post H.14) now routes the template
-- lookup through resolveEmailTemplate, which falls back to a
-- `company_id IS NULL` row when the tenant hasn't customised the
-- template. Without that global row the cascade returns
-- "template wasn't found for this company" and the receipt /
-- reminder never sends. order_confirmed, order_ready and
-- quote_sent already had global defaults seeded (verified live
-- 2026-05-26); these two were the gap.
--
-- Copy text is the same content the messaging-templates registry
-- (src/lib/messageTemplates/registry.ts) carries as defaults, so
-- the platform-side template editor and these DB rows stay in
-- sync. Operators can override with a tenant-specific row from
-- /admin/messaging-templates as usual.
--
-- RLS_OPT_OUT: email_templates RLS already in place (pre-baseline
-- table, policies untouched).

INSERT INTO public.email_templates
  (company_id, template_type, subject, body, is_active)
SELECT
  NULL,
  'balance_payment_received',
  'Payment received - invoice {{invoice_number}}',
  E'Hi {{client_name}},\n\n' ||
    E'Thanks for your payment of {{amount}} against invoice {{invoice_number}}.\n\n' ||
    E'Reply to this email if anything looks off.\n\n' ||
    E'Thanks,\n{{company_name}}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates
  WHERE company_id IS NULL AND template_type = 'balance_payment_received'
);

INSERT INTO public.email_templates
  (company_id, template_type, subject, body, is_active)
SELECT
  NULL,
  'balance_reminder_email',
  'Balance reminder for {{event_name}}',
  E'Hi {{first_name}},\n\n' ||
    E'Quick reminder that the balance for {{event_name}} on {{event_date}} is due by {{due_date}}. ' ||
    E'Outstanding amount: {{amount_due}}.\n\n' ||
    E'Pay link: {{pay_link}}\n\n' ||
    E'Reply here if you''d like a different payment method or a corrected invoice.\n\n' ||
    E'Thanks,\n{{tenant_name}}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates
  WHERE company_id IS NULL AND template_type = 'balance_reminder_email'
);
