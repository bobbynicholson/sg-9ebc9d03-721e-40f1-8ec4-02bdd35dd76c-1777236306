-- BATCH 9: GAMIFICATION & CMS TABLES

ALTER TABLE gamification_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_gamification_points" ON gamification_points FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE gamification_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_gamification_achievements" ON gamification_achievements FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_cms_pages" ON cms_pages FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_integrations" ON integrations FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_regions" ON regions FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 9: Gamification & CMS tables protected (5 tables)' as status;