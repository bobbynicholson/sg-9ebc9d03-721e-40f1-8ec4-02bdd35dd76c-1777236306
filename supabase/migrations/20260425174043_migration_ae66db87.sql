-- Add RLS to tables that have company_id but no policies
-- Using existing helper function get_user_company_id(uuid)

-- SUPPORT TICKETS (if not already protected)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets') THEN
    ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "company_view_tickets" ON support_tickets
      FOR SELECT USING (
        company_id = get_user_company_id(auth.uid()) OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      );
    
    CREATE POLICY "company_manage_tickets" ON support_tickets
      FOR ALL USING (
        company_id = get_user_company_id(auth.uid()) OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      );
  END IF;
END $$;

-- EMAIL TEMPLATES (if not already protected)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_templates') THEN
    ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "company_view_email_templates" ON email_templates
      FOR SELECT USING (
        company_id = get_user_company_id(auth.uid()) OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      );
    
    CREATE POLICY "company_manage_email_templates" ON email_templates
      FOR ALL USING (
        company_id = get_user_company_id(auth.uid()) OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      );
  END IF;
END $$;

-- SUBSCRIPTIONS (if not already protected)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions') THEN
    ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "company_view_subscriptions" ON subscriptions
      FOR SELECT USING (
        company_id = get_user_company_id(auth.uid()) OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      );
    
    CREATE POLICY "company_manage_subscriptions" ON subscriptions
      FOR ALL USING (
        company_id = get_user_company_id(auth.uid()) OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      );
  END IF;
END $$;

SELECT '✅ Added RLS to previously unprotected tables' as status;