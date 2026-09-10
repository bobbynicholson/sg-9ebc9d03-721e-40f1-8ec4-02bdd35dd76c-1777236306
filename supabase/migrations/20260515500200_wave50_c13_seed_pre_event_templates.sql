-- Wave 50 C13 -- seed pre_event_week_before + pre_event_day_before
-- as global-default email_templates rows.

INSERT INTO public.email_templates (company_id, template_type, subject, body, is_active)
SELECT NULL, 'pre_event_week_before',
  'One week to go -- {{event_name}} on {{event_date_label}}',
  'Hi {{first_name}},

Just a friendly reminder that {{event_name}} is one week away ({{event_date_label}}). If anything has changed -- final headcount, menu tweaks, drop-off time -- now is the perfect time to let us know.

Reply to this email or open your client portal to request a change.

Looking forward to it.

{{tenant_name}}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates
  WHERE template_type = 'pre_event_week_before'
    AND company_id IS NULL
);

INSERT INTO public.email_templates (company_id, template_type, subject, body, is_active)
SELECT NULL, 'pre_event_day_before',
  'Tomorrow''s the day -- {{event_name}}',
  'Hi {{first_name}},

Quick check-in -- everything is locked in for {{event_name}} tomorrow. Final guest count + venue address are confirmed on our side. If anything urgent comes up between now and then, give us a ring.

See you tomorrow.

{{tenant_name}}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates
  WHERE template_type = 'pre_event_day_before'
    AND company_id IS NULL
);
