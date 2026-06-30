-- Payment receipt defaults for invoice payments.
--
-- Keeps the database defaults aligned with
-- src/lib/messageTemplates/registry.ts and the payment notification
-- service. Tenant-specific rows are untouched; only platform-global
-- defaults (company_id IS NULL) are replaced.
--
-- RLS_OPT_OUT: email_templates policies are unchanged. Service-role
-- migration writes global defaults; tenant users still cannot edit
-- company_id IS NULL rows.

DELETE FROM public.email_templates
WHERE company_id IS NULL
  AND template_type IN (
    'deposit_payment_received',
    'balance_payment_received'
  );

INSERT INTO public.email_templates
  (company_id, user_id, template_type, subject, body, is_active)
VALUES
  (
    NULL,
    NULL,
    'deposit_payment_received',
    'Deposit received - {{event_name}} booking secure',
    E'Hi {{first_name}},\n\nWe''ve received your deposit for {{event_name}}. Amount: {{amount_formatted}}. Reference: {{invoice_number}}.\n\nYour booking is secure and your event date is locked in.\n\nThanks,\n{{tenant_name}}',
    true
  ),
  (
    NULL,
    NULL,
    'balance_payment_received',
    'Payment received - invoice {{invoice_number}}',
    E'Hi {{first_name}},\n\nThanks for your payment of {{amount_formatted}} against invoice {{invoice_number}}.\n\nThis invoice is now fully paid.\n\nReply to this email if anything looks off.\n\nThanks,\n{{tenant_name}}',
    true
  );
