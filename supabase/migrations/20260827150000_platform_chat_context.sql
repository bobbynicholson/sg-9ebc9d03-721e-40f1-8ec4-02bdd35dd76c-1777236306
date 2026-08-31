-- Allow platform super admins to keep a platform-scoped assistant session.
-- Tenant sessions remain company-scoped; NULL company_id is reserved for
-- authenticated profiles whose role/active_role is super_admin.

ALTER TABLE public.chat_sessions
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.chat_messages
  ALTER COLUMN company_id DROP NOT NULL;

DROP POLICY IF EXISTS "chat_sessions_tenant_select" ON public.chat_sessions;
CREATE POLICY "chat_sessions_tenant_select"
  ON public.chat_sessions FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
    )
    OR (
      company_id IS NULL AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
      )
    )
  );

DROP POLICY IF EXISTS "chat_sessions_self_insert" ON public.chat_sessions;
CREATE POLICY "chat_sessions_self_insert"
  ON public.chat_sessions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      company_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
      )
      OR (
        company_id IS NULL AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
        )
      )
    )
  );

DROP POLICY IF EXISTS "chat_messages_tenant_select" ON public.chat_messages;
CREATE POLICY "chat_messages_tenant_select"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
    )
    OR (
      company_id IS NULL AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
      )
    )
  );

DROP POLICY IF EXISTS "chat_messages_self_insert" ON public.chat_messages;
CREATE POLICY "chat_messages_self_insert"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      company_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
      )
      OR (
        company_id IS NULL AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
        )
      )
    )
  );

COMMENT ON COLUMN public.chat_sessions.company_id IS
  'Tenant id for tenant chats; NULL only for platform super-admin chats.';

COMMENT ON COLUMN public.chat_messages.company_id IS
  'Tenant id for tenant messages; NULL only for platform super-admin messages.';

DROP POLICY IF EXISTS ai_brain_sources_write ON public.ai_brain_sources;
CREATE POLICY ai_brain_sources_write ON public.ai_brain_sources
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('owner', 'company_admin', 'super_admin') OR p.active_role IN ('owner', 'company_admin', 'super_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('owner', 'company_admin', 'super_admin') OR p.active_role IN ('owner', 'company_admin', 'super_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  );

DROP POLICY IF EXISTS ai_brain_documents_write ON public.ai_brain_documents;
CREATE POLICY ai_brain_documents_write ON public.ai_brain_documents
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('owner', 'company_admin', 'super_admin') OR p.active_role IN ('owner', 'company_admin', 'super_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('owner', 'company_admin', 'super_admin') OR p.active_role IN ('owner', 'company_admin', 'super_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  );

-- Platform AI Brain sources and default access policies also use NULL as their
-- explicit platform scope. Company admins continue to manage only their own
-- company rows.
ALTER TABLE public.ai_brain_access_policies
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.ai_brain_tool_policies
  ALTER COLUMN company_id DROP NOT NULL;

DROP POLICY IF EXISTS ai_brain_access_read ON public.ai_brain_access_policies;
CREATE POLICY ai_brain_access_read ON public.ai_brain_access_policies
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('super_admin', 'owner', 'company_admin') OR p.active_role IN ('super_admin', 'owner', 'company_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  );

DROP POLICY IF EXISTS ai_brain_access_write ON public.ai_brain_access_policies;
CREATE POLICY ai_brain_access_write ON public.ai_brain_access_policies
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('super_admin', 'owner', 'company_admin') OR p.active_role IN ('super_admin', 'owner', 'company_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('super_admin', 'owner', 'company_admin') OR p.active_role IN ('super_admin', 'owner', 'company_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  );

DROP POLICY IF EXISTS ai_brain_tool_policies_select ON public.ai_brain_tool_policies;
CREATE POLICY ai_brain_tool_policies_select ON public.ai_brain_tool_policies
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('super_admin', 'owner', 'company_admin') OR p.active_role IN ('super_admin', 'owner', 'company_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  );

DROP POLICY IF EXISTS ai_brain_tool_policies_manage ON public.ai_brain_tool_policies;
CREATE POLICY ai_brain_tool_policies_manage ON public.ai_brain_tool_policies
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('super_admin', 'owner', 'company_admin') OR p.active_role IN ('super_admin', 'owner', 'company_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  )
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
        AND (p.role::text IN ('super_admin', 'owner', 'company_admin') OR p.active_role IN ('super_admin', 'owner', 'company_admin'))
    )
    OR (company_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role::text = 'super_admin' OR p.active_role = 'super_admin')
    ))
  );
