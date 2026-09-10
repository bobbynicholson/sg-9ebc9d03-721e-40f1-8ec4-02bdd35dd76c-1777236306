-- notifications.metadata
--
-- The central createNotification() in src/services/notificationService.ts
-- writes a `metadata` jsonb payload (e.g. { orderId, status, stage_key }) but
-- the live notifications table never had the column, so EVERY single-row
-- notification insert failed with PGRST204 ("Could not find the 'metadata'
-- column ... in the schema cache") - silently breaking in-app notifications
-- for actions that go through createNotification (lead->quote, etc.).
--
-- The service now degrades gracefully (retries without metadata) so this
-- migration is OPTIONAL for delivery, but running it lets the supplementary
-- payload actually persist. Idempotent / safe to re-run.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notifications.metadata IS
  'Supplementary JSON payload for in-app notifications (orderId, status, stage_key, etc.). Code tolerates the column being absent.';
