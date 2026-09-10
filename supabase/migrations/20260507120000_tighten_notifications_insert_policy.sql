-- P0-02: tighten notifications INSERT policy
--
-- The previous policy `auth.role() = 'authenticated' OR auth.role() = 'service_role'`
-- let any authenticated user insert a notification for any other user, in any
-- company. Notification spam, privacy leak vector. The notificationService.ts
-- comment at line 246-251 already describes the intended policy ("same tenant
-- OR self-targeted"); this migration brings the enforcement in line with the
-- documented intent.
--
-- After this migration:
--   - service_role inserts pass (background jobs, cron, webhook handlers)
--   - an authenticated user can insert a notification targeted at themselves
--     (recipient_id or user_id matches auth.uid())
--   - an authenticated user can insert a notification for someone else only
--     when both rows share a company_id with the inserter's profile.company_id
--   - all other inserts are denied
--
-- Existing code path notes:
--   - notificationService.createNotification accepts an optional service-role
--     client and is already used that way from server-side callers (webhooks,
--     post-order cascade, public token endpoints). Browser callers continue
--     to insert via the session client; the new policy permits this when the
--     recipient is in the same tenant.
--   - Direct insert call sites that bypass notificationService and do NOT use
--     a service-role client must now satisfy the same tenant/self constraint.
--     Sites already using the `admin` (service-role) client are unaffected.

DROP POLICY IF EXISTS "system_create_notifications" ON public.notifications;

CREATE POLICY "tenant_or_self_create_notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.role() = 'authenticated'
      AND (
        recipient_id = auth.uid()
        OR user_id = auth.uid()
        OR (
          company_id IS NOT NULL
          AND company_id = (
            SELECT p.company_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
            LIMIT 1
          )
        )
      )
    )
  );
