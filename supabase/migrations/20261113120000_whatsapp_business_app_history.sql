-- Mirror messages sent from the WhatsApp Business app and import the
-- history events Meta sends for numbers onboarded through Coexistence.
CREATE TABLE IF NOT EXISTS public.whatsapp_external_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_phone text NOT NULL,
  contact_name text,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  message_type text NOT NULL DEFAULT 'text',
  body text,
  wa_message_id text NOT NULL,
  status text,
  source text NOT NULL CHECK (source IN ('whatsapp_business_app', 'synced_history')),
  message_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, wa_message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_external_thread
  ON public.whatsapp_external_messages (company_id, contact_phone, message_at DESC);

ALTER TABLE public.whatsapp_external_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_external_messages_read_tenant"
  ON public.whatsapp_external_messages
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

COMMENT ON TABLE public.whatsapp_external_messages IS
  'WhatsApp Business app echoes and Coexistence history; written by the signed Meta webhook and merged into the Replies inbox.';
