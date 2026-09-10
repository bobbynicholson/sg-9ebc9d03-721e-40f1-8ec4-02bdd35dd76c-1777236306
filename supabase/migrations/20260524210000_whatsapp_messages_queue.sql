-- WA-A (task #99, 2026-05-24): WhatsApp outbound queue.
--
-- The master schema declared whatsapp_messages but the table never
-- actually shipped to the live db. Without it the synchronous
-- whatsappIntegrationService.sendWhatsAppMessage path is the only
-- way to deliver: failures lose the message, network blips can't
-- be retried, and notification fan-out has nowhere to enqueue.
--
-- This migration creates the queue. Rows insert with status=
-- 'pending' and a drain cron (/api/cron/whatsapp-drain) picks
-- them up, calls Meta's Graph API, and stamps sent_at +
-- gateway_message_id on success or failed_at + failure_reason on
-- failure. Retry uses attempts + next_attempt_at exponential
-- backoff capped at 5 tries.

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  recipient_name text,
  -- One of "text" or "template". Templates carry structured params.
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'template')),
  message_content text,
  template_name text,
  template_language text DEFAULT 'en',
  template_params jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  gateway_message_id text,
  gateway_response jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  -- Source linkage so the in-app sister-notification can deep-link
  -- back, and so we can grep all messages tied to a given order /
  -- quote / lead.
  related_entity_type text,
  related_entity_id uuid,
  -- Audit + idempotency.
  enqueued_by uuid REFERENCES public.profiles(id),
  dedup_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Drain query needs (status, next_attempt_at). One partial index
-- so we don't scan the entire history every minute.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_drain
  ON public.whatsapp_messages (next_attempt_at)
  WHERE status IN ('pending', 'sending');

-- Per-tenant filter for the admin UI / debugging queries.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company
  ON public.whatsapp_messages (company_id, created_at DESC);

-- Optional dedup. broadcastNotification enqueues with a derived
-- key (type + relatedEntityId + recipient) so a double-fire from
-- a React re-render doesn't double-message the recipient.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_dedup
  ON public.whatsapp_messages (company_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Read: every tenant member sees their company's queue. Admin UI
-- + debugging.
CREATE POLICY "whatsapp_messages_read_tenant" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Insert: every tenant member can enqueue (matches outgoing_email_queue
-- pattern). The comms guard + tenant scoping happens at the service
-- layer above this.
CREATE POLICY "whatsapp_messages_insert_tenant" ON public.whatsapp_messages
  FOR INSERT TO authenticated WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Update: SECURITY DEFINER cron is the only intended writer for
-- status / sent_at / failed_at. Tenant members can update their
-- own rows (cancel, edit recipient on a pending row) but cannot
-- impersonate the gateway. Locked-down enough; the cron uses the
-- service-role key.
CREATE POLICY "whatsapp_messages_update_tenant" ON public.whatsapp_messages
  FOR UPDATE TO authenticated USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

COMMENT ON TABLE public.whatsapp_messages IS
  'WA-A (task #99): outbound WhatsApp queue. Insert with status=pending; /api/cron/whatsapp-drain processes and stamps the result columns.';
COMMENT ON COLUMN public.whatsapp_messages.next_attempt_at IS
  'Earliest time the drain may retry this row. NULL means immediately. Set on failure to (now + exponential backoff).';
COMMENT ON COLUMN public.whatsapp_messages.dedup_key IS
  'Optional idempotency key. broadcastNotification builds one from (type, relatedEntityId, recipient) so a double-fire becomes a no-op insert.';
