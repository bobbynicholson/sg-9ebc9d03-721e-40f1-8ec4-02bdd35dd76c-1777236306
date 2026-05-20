-- Closes the running-todo "Tighten audit_logs and notifications
-- INSERT policies". audit_logs previously accepted any insert from
-- any authenticated user, which let one tenant's user spoof audit
-- rows claiming to be from another user. Tightens to:
--   - service_role: unrestricted (server-side cascade triggers,
--     edge functions, RPCs that insert on the caller's behalf)
--   - authenticated user: must stamp themselves on user_id (or
--     leave it NULL for system events triggered without a user
--     context) AND the company_id must match their own profile.
--
-- notifications already has the tightened policy
-- (tenant_or_self_create_notifications); no change needed there.

DROP POLICY IF EXISTS "insert_audit_logs" ON public.audit_logs;

CREATE POLICY "insert_audit_logs"
  ON public.audit_logs FOR INSERT
  TO public
  WITH CHECK (
    -- Service role bypass for trigger / RPC / edge function inserts.
    (auth.role() = 'service_role')
    OR
    (
      auth.role() = 'authenticated'
      AND (user_id IS NULL OR user_id = auth.uid())
      AND (
        company_id IS NULL
        OR company_id = (
          SELECT p.company_id FROM public.profiles p
           WHERE p.id = auth.uid()
           LIMIT 1
        )
      )
    )
  );
