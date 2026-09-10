-- BATCH 5: PAYMENT, BILLING & FINANCIAL TABLES

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_invoices" ON invoices FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_payments" ON payments FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_payment_gateways" ON payment_gateways FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_client_subscriptions" ON client_subscriptions FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE financial_depreciation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_financial_depreciation" ON financial_depreciation FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

ALTER TABLE currency_fluctuation_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_currency_alerts" ON currency_fluctuation_alerts FOR ALL USING (
  company_id = get_user_company_id(auth.uid()) OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

SELECT '✅ BATCH 5: Payment & financial tables protected (6 tables)' as status;