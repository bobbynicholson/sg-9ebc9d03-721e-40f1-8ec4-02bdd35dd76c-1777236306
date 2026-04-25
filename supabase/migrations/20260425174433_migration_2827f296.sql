-- BATCH 8: COMMUNICATION, SUPPORT & ADMIN TABLES

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_whatsapp_templates" ON whatsapp_templates FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_whatsapp_messages" ON whatsapp_messages FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_email_settings" ON email_settings FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_complaints" ON complaints FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE complaint_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_complaint_tickets" ON complaint_tickets FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_admin_notifications" ON admin_notifications FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE cancellation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_cancellation_requests" ON cancellation_requests FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_order_reviews" ON order_reviews FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 8: Communication & support tables protected (8 tables)' as status;