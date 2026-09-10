-- A.20 #3 (2026-05-18 phantom-table sweep): create chat_sessions
-- + chat_messages tables that chatBotService.ts has expected since
-- the ChatBot feature shipped. Both tables were absent from the
-- live schema; every createSession / saveMessage / getChatHistory
-- call silently no-op'd via supabase-js's {error} return shape,
-- and chat conversations existed only in-memory until the user
-- reloaded the page.
--
-- Tenant-scoped via company_id, same RLS shape as
-- cleaning_event_handovers (PR #71). Users can read every chat in
-- their tenant (operators reviewing what staff asked); only the
-- session/message OWNER can insert + update (a user can't write
-- in another user's name).

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_company_user
  ON public.chat_sessions (company_id, user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_started
  ON public.chat_sessions (user_id, started_at DESC);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_sessions_tenant_select" ON public.chat_sessions;
CREATE POLICY "chat_sessions_tenant_select"
  ON public.chat_sessions FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_sessions_self_insert" ON public.chat_sessions;
CREATE POLICY "chat_sessions_self_insert"
  ON public.chat_sessions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_sessions_self_update" ON public.chat_sessions;
CREATE POLICY "chat_sessions_self_update"
  ON public.chat_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON public.chat_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_company_created
  ON public.chat_messages (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON public.chat_messages (user_id, created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_tenant_select" ON public.chat_messages;
CREATE POLICY "chat_messages_tenant_select"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_messages_self_insert" ON public.chat_messages;
CREATE POLICY "chat_messages_self_insert"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public._chat_sessions_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_sessions_touch_updated_at ON public.chat_sessions;
CREATE TRIGGER chat_sessions_touch_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public._chat_sessions_touch_updated_at();

COMMENT ON TABLE public.chat_sessions IS
  'A.20 #3 - ChatBot conversation sessions, one per user-initiated chat.';
COMMENT ON TABLE public.chat_messages IS
  'A.20 #3 - ChatBot conversation history. Persisted so conversations survive page reload.';
