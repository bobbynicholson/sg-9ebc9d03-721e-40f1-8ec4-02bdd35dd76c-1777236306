-- Successful email audit rows historically relied on created_at while
-- leaving sent_at NULL. Stamp the provider-handoff time explicitly so
-- support can measure acceptance-email timing and distinguish delivered
-- attempts from failed/simulated rows.

UPDATE public.email_automation_log
SET
  sent_at = created_at,
  updated_at = COALESCE(updated_at, created_at)
WHERE status = 'sent'
  AND sent_at IS NULL;
