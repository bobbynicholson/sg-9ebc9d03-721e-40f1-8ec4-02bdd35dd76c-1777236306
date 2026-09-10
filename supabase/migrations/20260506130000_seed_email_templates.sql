-- Seed global-default email_templates rows.
--
-- One row per canonical client-facing template type, with company_id IS
-- NULL so every tenant inherits the same baseline and can override
-- per-tenant by inserting their own row via the Lifecycle Emails ->
-- Templates panel. The central resolver
-- (src/services/email/templateResolver.ts) tries the tenant's row
-- first, then falls back to the global default seeded here, then to
-- the caller's hardcoded fallback if neither exists.
--
-- Bodies use Mustache-style {{variable}} placeholders. The resolver
-- substitutes whatever the caller passes; unknown placeholders are
-- left intact so an operator catches typos against the live preview
-- rather than a silently empty field.
--
-- RLS adjustment: existing policies scope email_templates by
-- company_id. Adding a SELECT policy that lets any authenticated user
-- read rows where company_id IS NULL so the in-app resolver can fetch
-- the global default. Server-side callers using the service-role
-- client are unaffected (service role bypasses RLS). The existing
-- company_manage_email_templates policy guards INSERT/UPDATE/DELETE
-- so a tenant can never modify NULL-company rows.

-- Ensure global-default rows are visible to authenticated users for
-- read-only resolution. Drop-and-recreate is idempotent.
DROP POLICY IF EXISTS "global_default_email_templates_readable"
  ON public.email_templates;
CREATE POLICY "global_default_email_templates_readable"
  ON public.email_templates
  FOR SELECT
  USING (company_id IS NULL);

-- Idempotent seed: delete any existing global-default rows for the
-- target template_types first, then insert. This makes the migration
-- safe to re-run when copy is updated.
DELETE FROM public.email_templates
WHERE company_id IS NULL
  AND template_type IN (
    'quote_request_received',
    'quote_sent',
    'quote_accepted_client',
    'quote_changes_requested',
    'deposit_invoice_issued',
    'balance_invoice_issued',
    'invoice_issued',
    'deposit_payment_received',
    'balance_payment_received',
    'order_confirmed',
    'order_preparing',
    'order_ready',
    'order_in_transit',
    'order_delivered',
    'cancellation_approved',
    'postponement_approved',
    'refund_paid',
    'review_request'
  );

INSERT INTO public.email_templates
  (company_id, user_id, template_type, subject, body, is_active)
VALUES
  -- Lead / quote lifecycle ---------------------------------------------------
  (NULL, NULL, 'quote_request_received',
    'Thanks for your enquiry, {{first_name}}',
    E'Hi {{first_name}},\n\nWe''ve received your enquiry for {{event_name}} on {{event_date}}. {{tenant_name}} will get back to you with a quote shortly.\n\nIf anything has changed on your side, just reply to this email.\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'quote_sent',
    '{{event_name}} quote from {{tenant_name}} -- R {{total}}',
    E'Hi {{first_name}},\n\nYour quote for {{event_name}} is ready. Total: R {{total}}.\n\nReview and accept it here: {{quote_link}}\n\nReply to this email if anything needs adjusting -- we''ll update the quote and resend.\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'quote_accepted_client',
    '{{first_name}}, you''re booked in for {{event_name}} with {{tenant_name}}',
    E'Hi {{first_name}},\n\nThanks for accepting your {{event_name}} quote -- you''re booked in.\n\nHere''s what happens from here:\n\n1. Confirmation email: this email is your record. A copy of the quote is on your client portal.\n2. Deposit invoice: {{tenant_name}} will send the deposit invoice shortly to lock in your event date.\n3. Event day{{event_day_suffix}}: we''ll be in touch the week before with final headcount and any last tweaks.\n\nIf anything has changed on your side, just reply to this email and we''ll sort it.\n\nLooking forward to it,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'quote_changes_requested',
    'Quote updated for {{event_name}}',
    E'Hi {{first_name}},\n\nWe''ve updated your {{event_name}} quote with the changes you requested. Review the new version here: {{quote_link}}\n\nReply if anything else needs adjusting.\n\nThanks,\n{{tenant_name}}',
    true),

  -- Invoicing ---------------------------------------------------------------
  (NULL, NULL, 'deposit_invoice_issued',
    'Deposit invoice {{invoice_number}} - {{event_name}}',
    E'Hi {{first_name}},\n\n{{tenant_name}} issued the deposit invoice {{invoice_number}} for {{event_name}}. Deposit due: {{amount}}.\n\nOpen the invoice: {{invoice_link}}\n\nOnce the payment clears, your event date is locked in.\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'balance_invoice_issued',
    'Balance invoice {{invoice_number}} - {{event_name}}',
    E'Hi {{first_name}},\n\n{{tenant_name}} issued the balance invoice {{invoice_number}} for {{event_name}}. Balance due: {{amount}}.\n\nOpen the invoice: {{invoice_link}}\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'invoice_issued',
    'Invoice {{invoice_number}} ready -- {{event_name}}',
    E'Hi {{first_name}},\n\n{{tenant_name}} issued invoice {{invoice_number}} for {{event_name}}. Total: {{amount}}.\n\nOpen the invoice: {{invoice_link}}\n\nThanks,\n{{tenant_name}}',
    true),

  -- Payments ---------------------------------------------------------------
  (NULL, NULL, 'deposit_payment_received',
    'Deposit received -- {{event_name}} confirmed',
    E'Hi {{first_name}},\n\nWe''ve received your deposit for {{event_name}}. Amount: R {{amount}}. Reference: {{invoice_number}}.\n\nYour event date is now locked in. We''ll send the balance invoice closer to the event.\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'balance_payment_received',
    'Balance received -- {{event_name}} fully paid',
    E'Hi {{first_name}},\n\nWe''ve received the balance for {{event_name}}. Amount: R {{amount}}. Reference: {{invoice_number}}.\n\nThat''s everything sorted on the payment side. We''re looking forward to delivering a great event.\n\nThanks,\n{{tenant_name}}',
    true),

  -- Order / operations ----------------------------------------------------
  (NULL, NULL, 'order_confirmed',
    'Order confirmed -- {{order_number}}',
    E'Hi {{first_name}},\n\nYour order {{order_number}}{{event_date_phrase}} is confirmed. We''ll be in touch closer to the day with the final headcount and any last tweaks.\n\nThanks for booking with us.\n\n{{tenant_name}}',
    true),

  (NULL, NULL, 'order_preparing',
    'We''re prepping your {{event_name}} order',
    E'Hi {{first_name}},\n\n{{tenant_name}} has started prep{{event_date_phrase}}. We''ll let you know when it''s on the way.\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'order_ready',
    'Your {{event_name}} order is ready',
    E'Hi {{first_name}},\n\n{{tenant_name}} has finished prep. Driver will pick up shortly and we''ll send tracking details once they''re rolling.\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'order_in_transit',
    'On the way -- {{order_number}}',
    E'Hi {{first_name}},\n\nGood news -- your order {{order_number}} has just left the kitchen and is on its way{{venue_phrase}}. {{eta_sentence}}\n\nReply to this email if anything changes on your side.\n\n{{tenant_name}}',
    true),

  (NULL, NULL, 'order_delivered',
    'Your {{event_name}} order is delivered',
    E'Hi {{first_name}},\n\nYour order {{order_number}} has been delivered. We hope it lands the way you hoped!\n\nIf anything wasn''t quite right, please reply -- we read every email and we''d rather hear it.\n\nThanks,\n{{tenant_name}}',
    true),

  -- Cancellation / postponement / refund ---------------------------------
  (NULL, NULL, 'cancellation_approved',
    '{{event_name}} cancelled',
    E'Hi {{first_name}},\n\nThis confirms that order {{order_number}}{{event_date_label}} has been cancelled.\n\n{{refund_paragraph}}If this wasn''t expected, please reply to this email and we''ll sort it out straight away.\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'postponement_approved',
    '{{event_name}} moved to {{new_date}}',
    E'Hi {{first_name}},\n\nYour booking has been postponed. New event date: {{new_date}}.\n\nEverything else on the order stays the same. If you need to tweak anything, just reply to this email.\n\nThanks,\n{{tenant_name}}',
    true),

  (NULL, NULL, 'refund_paid',
    'Refund paid -- R {{amount}} for {{event_name}}',
    E'Hi {{first_name}},\n\nConfirming that the refund of {{amount}} for the cancelled order {{order_number}} has been processed. It should land in your account within the next 1-3 business days, depending on your bank.\n\nReply to this email if anything looks off.\n\nThanks,\n{{tenant_name}}',
    true),

  -- Post-event ------------------------------------------------------------
  (NULL, NULL, 'review_request',
    'How was {{event_name}}, {{first_name}}?',
    E'Hi {{first_name}},\n\nHope your {{event_name}} landed brilliantly. We''d really value a quick review -- it takes a minute and helps other clients find us.\n\nLeave a review: {{review_link}}\n\nThanks for choosing {{tenant_name}}.',
    true);
