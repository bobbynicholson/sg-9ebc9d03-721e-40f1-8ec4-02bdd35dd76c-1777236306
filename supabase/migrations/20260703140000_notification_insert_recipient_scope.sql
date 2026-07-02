-- SECURITY: block cross-tenant notification injection.
--
-- tenant_or_self_create_notifications (Wave 45) lets an authenticated
-- user INSERT any row where company_id = their own company_id, WITHOUT
-- checking recipient_id. An attacker in tenant A can insert
--   { company_id: A, recipient_id: <victim uid in tenant B>, title/message: ... }
-- The victim reads it via the recipient_id = auth.uid() SELECT policy and
-- their unread badge (notificationService.getUnreadCount, no company
-- filter) increments -- an authenticated cross-tenant spam/phishing vector.
--
-- Fix: in the company branch, require the recipient to belong to the
-- row's company. Self-insert branches (recipient_id/user_id = auth.uid())
-- and the service_role bypass are unchanged, so all legitimate inserts
-- (including server-side fan-out via service role) keep working.
--
-- RLS_OPT_OUT: policy only; no CREATE TABLE.

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
            SELECT p.company_id FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
            LIMIT 1
          )
          AND (
            recipient_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.profiles rp
              WHERE rp.id = notifications.recipient_id
                AND rp.company_id = notifications.company_id
            )
          )
        )
      )
    )
  );
