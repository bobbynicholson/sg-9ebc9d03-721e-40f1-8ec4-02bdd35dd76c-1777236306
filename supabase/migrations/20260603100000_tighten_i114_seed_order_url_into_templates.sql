-- TIGHTEN I.114 (2026-06-02): wire {{order_url}} placeholder into every
-- global-default customer email template that mentions an order. The
-- email-firing services (orderWorkflow, cancellationEmails, etc.) now
-- mint a fresh /c/order/{id}?t=... link at send time and resolve the
-- placeholder, so the client gets a working "view your order" link in
-- every status email + cancellation + refund + postponement.
--
-- Only touches GLOBAL defaults (company_id IS NULL, user_id IS NULL).
-- Per-tenant overrides stay as the tenant wrote them - operators who
-- customised their templates can choose whether to add {{order_url}}
-- on their own time. The fallback bodies in the TS code carry the
-- placeholder unconditionally, so tenants without overrides get the
-- link automatically.

DO $$
DECLARE
  rows_updated integer;
BEGIN
  -- order_confirmed
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\nYour order {{order_number}}{{event_date_phrase}} is confirmed. We''ll be in touch closer to the day with the final headcount and any last tweaks.\n\nView your order anytime: {{order_url}}\n\nThanks for booking with us.\n\n{{tenant_name}}'
  WHERE template_type = 'order_confirmed'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] order_confirmed: % rows', rows_updated;

  -- order_preparing
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\n{{tenant_name}} has started prep{{event_date_phrase}}. We''ll let you know when it''s on the way.\n\nTrack your order: {{order_url}}\n\nThanks,\n{{tenant_name}}'
  WHERE template_type = 'order_preparing'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] order_preparing: % rows', rows_updated;

  -- order_ready
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\n{{tenant_name}} has finished prep. Driver will pick up shortly and we''ll send tracking details once they''re rolling.\n\nLive updates here: {{order_url}}\n\nThanks,\n{{tenant_name}}'
  WHERE template_type = 'order_ready'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] order_ready: % rows', rows_updated;

  -- order_in_transit
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\nGood news -- your order {{order_number}} has just left the kitchen and is on its way{{venue_phrase}}. {{eta_sentence}}\n\nLive tracking: {{order_url}}\n\nReply to this email if anything changes on your side.\n\n{{tenant_name}}'
  WHERE template_type = 'order_in_transit'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] order_in_transit: % rows', rows_updated;

  -- order_delivered
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\nYour order {{order_number}} has been delivered. We hope it lands the way you hoped!\n\nYour booking record: {{order_url}}\n\nIf anything wasn''t quite right, please reply -- we read every email and we''d rather hear it.\n\nThanks,\n{{tenant_name}}'
  WHERE template_type = 'order_delivered'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] order_delivered: % rows', rows_updated;

  -- cancellation_approved
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\nThis confirms that order {{order_number}}{{event_date_label}} has been cancelled.\n\n{{refund_paragraph}}Your order record: {{order_url}}\n\nIf this wasn''t expected, please reply to this email and we''ll sort it out straight away.\n\nThanks,\n{{tenant_name}}'
  WHERE template_type = 'cancellation_approved'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] cancellation_approved: % rows', rows_updated;

  -- postponement_approved
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\nYour booking has been postponed. New event date: {{new_date}}.\n\nEverything else on the order stays the same. If you need to tweak anything, just reply to this email.\n\nView your updated booking: {{order_url}}\n\nThanks,\n{{tenant_name}}'
  WHERE template_type = 'postponement_approved'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] postponement_approved: % rows', rows_updated;

  -- refund_paid
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\nConfirming that the refund of {{amount}} for the cancelled order {{order_number}} has been processed. It should land in your account within the next 1-3 business days, depending on your bank.\n\nYour order record: {{order_url}}\n\nReply to this email if anything looks off.\n\nThanks,\n{{tenant_name}}'
  WHERE template_type = 'refund_paid'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] refund_paid: % rows', rows_updated;

  -- quote_accepted_client - the I.111 sore spot. Add the bridge URL.
  UPDATE public.email_templates
  SET body = E'Hi {{first_name}},\n\nThanks for accepting the quote for {{event_name}}. We''ve booked you in.\n\nA copy of the order plus tracking is here: {{order_url}}\n\nWe''ll send the deposit invoice through next; once that''s settled we''re fully confirmed.\n\nThanks,\n{{tenant_name}}'
  WHERE template_type = 'quote_accepted_client'
    AND company_id IS NULL
    AND user_id IS NULL
    AND body NOT LIKE '%order_url%';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[I.114] quote_accepted_client: % rows', rows_updated;
END $$;
