-- WhatsApp queue claims need a lease so overlapping cron invocations cannot
-- immediately re-send rows that another invocation is currently processing.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_expired_lease
  ON public.whatsapp_messages (locked_at)
  WHERE status = 'sending';

COMMENT ON COLUMN public.whatsapp_messages.locked_at IS
  'Lease timestamp set by whatsapp-drain while a message is being sent; only expired leases may be recovered.';

NOTIFY pgrst, 'reload schema';
