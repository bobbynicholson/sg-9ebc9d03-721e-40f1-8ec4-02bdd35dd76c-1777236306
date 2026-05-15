-- Wave 45 perf: notifications RLS init-plan rewrite + dedup INSERT policies

-- tenant_create_notifications is a strict subset of tenant_or_self_create_notifications
-- (latter additionally allows user_id = auth.uid()). Drop the older one to remove
-- the multiple_permissive_policies warnings on INSERT.
DROP POLICY IF EXISTS tenant_create_notifications ON public.notifications;

DROP POLICY IF EXISTS tenant_or_self_create_notifications ON public.notifications;
CREATE POLICY tenant_or_self_create_notifications
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.role()) = 'service_role')
    OR (
      ((SELECT auth.role()) = 'authenticated')
      AND (
        recipient_id = (SELECT auth.uid())
        OR user_id = (SELECT auth.uid())
        OR (
          company_id IS NOT NULL
          AND company_id = (
            SELECT p.company_id FROM profiles p
            WHERE p.id = (SELECT auth.uid())
            LIMIT 1
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS user_delete_own_notifications ON public.notifications;
CREATE POLICY user_delete_own_notifications
  ON public.notifications
  FOR DELETE
  USING (recipient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_read_own_notifications ON public.notifications;
CREATE POLICY user_read_own_notifications
  ON public.notifications
  FOR SELECT
  USING (recipient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_update_own_notifications ON public.notifications;
CREATE POLICY user_update_own_notifications
  ON public.notifications
  FOR UPDATE
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()));
