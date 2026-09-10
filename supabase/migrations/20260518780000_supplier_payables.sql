-- PR-C of the cashflow cost-mapping plan
-- (docs/audits/cashflow-cost-mapping-plan.md). suppliers carries
-- payment_terms but no outstanding-balance ledger today; every
-- supplier cash-out is invisible to the cashflow forecast until
-- the owner manually types into Contingency. supplier_payables
-- closes the gap: one row per supplier invoice the tenant owes
-- with due_date + amount + status, RLS-scoped per tenant.

CREATE TABLE IF NOT EXISTS public.supplier_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  due_date date NOT NULL,
  invoice_ref text,
  notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'disputed', 'written_off')),
  paid_at timestamptz,
  paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_payables_company_status_due
  ON public.supplier_payables (company_id, status, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_payables_supplier
  ON public.supplier_payables (supplier_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.supplier_payables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_payables_tenant_select" ON public.supplier_payables;
CREATE POLICY "supplier_payables_tenant_select"
  ON public.supplier_payables FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "supplier_payables_tenant_insert" ON public.supplier_payables;
CREATE POLICY "supplier_payables_tenant_insert"
  ON public.supplier_payables FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "supplier_payables_tenant_update" ON public.supplier_payables;
CREATE POLICY "supplier_payables_tenant_update"
  ON public.supplier_payables FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public._supplier_payables_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_payables_touch_updated_at ON public.supplier_payables;
CREATE TRIGGER supplier_payables_touch_updated_at
  BEFORE UPDATE ON public.supplier_payables
  FOR EACH ROW EXECUTE FUNCTION public._supplier_payables_touch_updated_at();

COMMENT ON TABLE public.supplier_payables IS
  'PR-C of cashflow cost mapping plan. Per-tenant outstanding invoices owed to suppliers. Drives the cashflow forecast cost side and the /admin/suppliers payables tab.';
