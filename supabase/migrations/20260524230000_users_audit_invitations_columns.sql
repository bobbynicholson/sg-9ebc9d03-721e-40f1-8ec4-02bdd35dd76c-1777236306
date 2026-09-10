-- USR-C (task #208, 2026-05-24): two complementary schema bits the
-- /admin/users deferred bundle needs.
--
-- 1. staff_invitations email + full_name columns. The service
--    function inviteStaffMember (src/services/userManagementService.ts
--    line 46) tries to insert these columns but they don't exist on
--    the live db. Every invite call was either silently dropping
--    them (PostgREST `as any` cast in the file) or failing - and
--    the function was unreferenced in the UI so nobody noticed.
--    Adding them now so the new Invite User dialog works.
--
-- 2. user_access_audit table. Immutable log of who-changed-what-
--    when on role / department / status mutations. assignDepartments
--    and updateUserStatus are the two hot paths; the audit row is
--    written from the service layer alongside the DB write.

ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_company_status
  ON public.staff_invitations (company_id, status, created_at DESC);

COMMENT ON COLUMN public.staff_invitations.email IS
  'USR-C: invitee email. Captured at invite-time, used as the magic-link recipient. Distinct from profiles.email because the invitee may not have a profile row until they accept.';
COMMENT ON COLUMN public.staff_invitations.full_name IS
  'USR-C: invitee display name. Pre-fills the registration form on accept.';

CREATE TABLE IF NOT EXISTS public.user_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id),
  -- 'departments_changed' | 'status_changed' | 'invited' | 'revoked'
  action text NOT NULL,
  -- jsonb snapshot of the previous and new state, e.g.
  -- { "before": { "departments": ["kitchen_staff"] }, "after": { "departments": ["kitchen_staff","driver"] } }
  -- Free-form so we can add new action shapes without a schema bump.
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_access_audit_company_target
  ON public.user_access_audit (company_id, target_user_id, created_at DESC);

ALTER TABLE public.user_access_audit ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped read: every authenticated member sees their company's
-- audit log. INSERT-only from the service layer (no UPDATE / DELETE
-- policy = immutable).
CREATE POLICY "user_access_audit_read_tenant" ON public.user_access_audit
  FOR SELECT TO authenticated USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "user_access_audit_insert_tenant" ON public.user_access_audit
  FOR INSERT TO authenticated WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

COMMENT ON TABLE public.user_access_audit IS
  'USR-C: append-only audit of role / department / status mutations on /admin/users. Service-layer writes; no UI mutates rows after insert.';
