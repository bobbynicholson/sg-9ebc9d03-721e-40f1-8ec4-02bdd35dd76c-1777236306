-- WhatsApp replies inbox and client consent.
--
-- Additive only. Replies arrive through /api/webhooks/whatsapp, which uses the
-- service role, so company users can read their own replies and mark them read
-- but can never add one.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clients_company_name
  ON public.clients (company_id, client_name, id);
CREATE INDEX IF NOT EXISTS idx_clients_company_whatsapp_opt_in
  ON public.clients (company_id, whatsapp_opt_in);

COMMENT ON COLUMN public.clients.whatsapp_opt_in IS
  'NULL = not asked, TRUE = agreed to WhatsApp messages, FALSE = opted out.';

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_phone text NOT NULL,
  contact_name text,
  message_type text NOT NULL DEFAULT 'text',
  body text,
  wa_message_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_inbound_wa_message
  ON public.whatsapp_inbound_messages (wa_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_company_received
  ON public.whatsapp_inbound_messages (company_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_company_phone
  ON public.whatsapp_inbound_messages (company_id, from_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gateway_id
  ON public.whatsapp_messages (gateway_message_id)
  WHERE gateway_message_id IS NOT NULL;

-- One row per person, so the Replies page can page through conversations
-- without scanning every message.
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone text NOT NULL,
  contact_name text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_page
  ON public.whatsapp_conversations (company_id, last_message_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_unread
  ON public.whatsapp_conversations (company_id, unread_count)
  WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company_phone_created
  ON public.whatsapp_messages (company_id, recipient_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_unread
  ON public.whatsapp_inbound_messages (company_id, from_phone)
  WHERE read_at IS NULL;

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- Sums the Activity report in the database, so it never reads the whole
-- message history into the app. Only the server may call it.
CREATE OR REPLACE FUNCTION public.whatsapp_template_report(p_company_id uuid, p_since timestamptz)
RETURNS TABLE (template_name text, sent bigint, delivered bigint, read_count bigint, failed bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    m.template_name,
    COUNT(*) FILTER (WHERE m.status IN ('sent', 'delivered', 'read')),
    COUNT(*) FILTER (WHERE m.status IN ('delivered', 'read')),
    COUNT(*) FILTER (WHERE m.status = 'read'),
    COUNT(*) FILTER (WHERE m.status = 'failed')
  FROM public.whatsapp_messages m
  WHERE m.company_id = p_company_id AND m.created_at >= p_since
  GROUP BY m.template_name
  ORDER BY 2 DESC;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_template_report(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_template_report(uuid, timestamptz) TO service_role;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company_created
  ON public.whatsapp_messages (company_id, created_at DESC, id DESC);

CREATE POLICY "whatsapp_conversations_read_tenant" ON public.whatsapp_conversations
  FOR SELECT TO authenticated USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_inbound_read_tenant" ON public.whatsapp_inbound_messages
  FOR SELECT TO authenticated USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "whatsapp_inbound_update_tenant" ON public.whatsapp_inbound_messages
  FOR UPDATE TO authenticated USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
