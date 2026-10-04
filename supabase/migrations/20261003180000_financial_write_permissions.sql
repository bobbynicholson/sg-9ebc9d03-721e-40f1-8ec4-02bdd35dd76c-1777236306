-- Close legacy FOR ALL company-membership policies: clients and operational
-- staff must not manufacture completed payments or activate merchant accounts.
-- RLS_OPT_OUT: policy/function changes only; no new tables.
CREATE OR REPLACE FUNCTION public.can_manage_company_payments(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
      AND (p.role::text = 'super_admin' OR (
        p.company_id = p_company_id
        AND p.role::text IN ('owner','company_admin','admin','sales_admin','region_admin')
      ))
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_company_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_company_payments(uuid) TO authenticated, service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_access_payments ON public.payments;
DROP POLICY IF EXISTS payments_scoped_read ON public.payments;
CREATE POLICY payments_scoped_read ON public.payments FOR SELECT TO authenticated USING (
  public.can_manage_company_payments(company_id)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
             AND p.company_id = payments.company_id AND p.role::text <> 'client')
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = payments.client_id
             AND c.company_id = payments.company_id
             AND (c.user_id = (SELECT auth.uid()) OR lower(c.email) =
               (SELECT lower(p.email) FROM public.profiles p WHERE p.id = (SELECT auth.uid()))))
);
DROP POLICY IF EXISTS payments_finance_manage ON public.payments;
CREATE POLICY payments_finance_manage ON public.payments FOR ALL TO authenticated
  USING (public.can_manage_company_payments(company_id))
  WITH CHECK (public.can_manage_company_payments(company_id));

-- Restrictive policies also fence any permissive legacy policies remaining in
-- an existing deployment. Service-role settlement continues to bypass RLS.
DO $$ DECLARE v_table text; v_command text; v_name text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['payments','invoices','payment_gateways'] LOOP
    FOREACH v_command IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      v_name := v_table || '_financial_' || lower(v_command);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_name, v_table);
      IF v_command = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_manage_company_payments(company_id))', v_name, v_table);
      ELSIF v_command = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_manage_company_payments(company_id)) WITH CHECK (public.can_manage_company_payments(company_id))', v_name, v_table);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_manage_company_payments(company_id))', v_name, v_table);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DROP POLICY IF EXISTS payment_attempts_company_read ON public.payment_attempts;
CREATE POLICY payment_attempts_company_read ON public.payment_attempts FOR SELECT TO authenticated USING (
  public.can_manage_company_payments(company_id)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
             AND p.company_id = payment_attempts.company_id AND p.role::text <> 'client')
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = payment_attempts.client_id
             AND c.company_id = payment_attempts.company_id
             AND (c.user_id = (SELECT auth.uid()) OR lower(c.email) =
               (SELECT lower(p.email) FROM public.profiles p WHERE p.id = (SELECT auth.uid()))))
);
