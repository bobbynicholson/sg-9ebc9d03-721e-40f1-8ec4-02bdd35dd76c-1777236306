-- Allow a user to delete only their own saved assistant conversations.
-- Messages are removed through chat_sessions.session_id ON DELETE CASCADE.
-- Temporary chats never create rows, so this policy only applies to saved chats.

DROP POLICY IF EXISTS "chat_sessions_self_delete" ON public.chat_sessions;
CREATE POLICY "chat_sessions_self_delete"
  ON public.chat_sessions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON POLICY "chat_sessions_self_delete" ON public.chat_sessions IS
  'Users may delete only their own saved assistant sessions; child messages cascade.';
