-- WTR-B: global default for the staff-facing waiter assignment email.
-- The order Service team section sends this directly when an admin
-- assigns a waiter. Tenants can override the wording from the messaging
-- template editor because the key is also present in the registry.

INSERT INTO public.email_templates
  (company_id, template_type, subject, body, is_active)
SELECT
  NULL,
  'waiter_assignment_email',
  'Service job assigned - {{order_number}}',
  E'Hi {{first_name}},\n\n' ||
    E'You have been assigned to service {{event_name}} for {{company_name}}.\n\n' ||
    E'Order: {{order_number}}\n' ||
    E'Date: {{shift_date}}\n' ||
    E'Time: {{shift_time}}\n' ||
    E'Venue: {{venue}}\n\n' ||
    E'Open the order brief before you go on site: {{order_url}}\n\n' ||
    E'Thanks,\n{{company_name}}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates
  WHERE company_id IS NULL AND template_type = 'waiter_assignment_email'
);
