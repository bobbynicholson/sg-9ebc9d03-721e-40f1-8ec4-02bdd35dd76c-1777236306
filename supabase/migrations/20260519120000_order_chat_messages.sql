-- CLI-J (client deep audit, CLI-31): per-order chat thread shared
-- between the client and the catering team. Why a separate table
-- from dispatch_messages: dispatch_messages is private logistics
-- chatter (driver <-> dispatcher) and must never leak to clients.
-- order_chat_messages is the customer-facing channel so its RLS
-- includes the client owning the order; admin, dispatcher and
-- kitchen staff in the same tenant also see and post.

CREATE TABLE IF NOT EXISTS public.order_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('client', 'admin', 'kitchen', 'dispatcher', 'driver')),
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_chat_messages_order_created
  ON public.order_chat_messages (order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_order_chat_messages_company_created
  ON public.order_chat_messages (company_id, created_at DESC);

-- Unread lookups by viewer (sender_role IN (...) AND read_at IS NULL),
-- filtered to a single tenant; partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_order_chat_messages_unread
  ON public.order_chat_messages (company_id, sender_role, order_id)
  WHERE read_at IS NULL;

ALTER TABLE public.order_chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: staff in the tenant OR the client who owns the order.
DROP POLICY IF EXISTS "order_chat_messages_read" ON public.order_chat_messages;
CREATE POLICY "order_chat_messages_read"
  ON public.order_chat_messages FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.clients c ON c.id = o.client_id
      WHERE c.user_id = auth.uid()
    )
  );

-- INSERT: must be the sender, and either a staff profile in the
-- tenant OR the client owning the order. Sender role must match the
-- audience (client posts as 'client'; staff posts as their role).
DROP POLICY IF EXISTS "order_chat_messages_insert" ON public.order_chat_messages;
CREATE POLICY "order_chat_messages_insert"
  ON public.order_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (
        sender_role = 'client'
        AND order_id IN (
          SELECT o.id FROM public.orders o
          JOIN public.clients c ON c.id = o.client_id
          WHERE c.user_id = auth.uid()
        )
      )
      OR (
        sender_role IN ('admin', 'kitchen', 'dispatcher', 'driver')
        AND company_id IN (
          SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
        )
      )
    )
  );

-- UPDATE: only used for marking read. Restrict to the same audience
-- that can read, and only let them flip read_at (no body edits).
DROP POLICY IF EXISTS "order_chat_messages_mark_read" ON public.order_chat_messages;
CREATE POLICY "order_chat_messages_mark_read"
  ON public.order_chat_messages FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.clients c ON c.id = o.client_id
      WHERE c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.order_chat_messages IS
  'CLI-J - per-order client <-> caterer chat. Separate from dispatch_messages so client RLS can read without leaking driver logistics.';
