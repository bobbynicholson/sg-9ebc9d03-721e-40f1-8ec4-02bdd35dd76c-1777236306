-- P2-02: tighten sa_tax_deductibility_rules SELECT policy
--
-- Existing policy `sa_tax_rules_read_all USING (true)` opened the table
-- to anon. The data is reference (deductibility codes, categories,
-- expiry dates per SARS), not sensitive, but USING(true) violates the
-- platform-wide zero-trust pattern documented in running-todo Phase 2B.
--
-- Tighten to authenticated users only. Anon callers no longer need
-- access -- the only legitimate consumer is the receipt-mapper UX
-- inside /admin/onboarding/receipts which always runs under an
-- authenticated session.

DROP POLICY IF EXISTS "sa_tax_rules_read_all" ON public.sa_tax_deductibility_rules;

CREATE POLICY "sa_tax_rules_read_authenticated" ON public.sa_tax_deductibility_rules
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
