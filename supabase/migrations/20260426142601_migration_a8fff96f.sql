-- Audit Logs Table Setup
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NULL,
    details JSONB NULL,
    ip_address TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_view_all_audit_logs" ON audit_logs;
CREATE POLICY "super_admin_view_all_audit_logs" ON audit_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'::user_role)
);

DROP POLICY IF EXISTS "company_admin_view_company_audit_logs" ON audit_logs;
CREATE POLICY "company_admin_view_company_audit_logs" ON audit_logs FOR SELECT USING (
    company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())
);

DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' OR auth.role() = 'service_role'
);