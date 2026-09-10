-- PR-D of the cashflow cost-mapping plan. fixed_costs - the
-- recurring rent / software / vehicles ledger. Walked by the
-- cashflow forecast (PR-E) and by the daily cron that advances
-- next_due_date once it crosses.

CREATE TABLE IF NOT EXISTS public.fixed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  cadence text NOT NULL
    CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'annual')),
  next_due_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fixed_costs_company_active_next
  ON public.fixed_costs (company_id, active, next_due_date)
  WHERE deleted_at IS NULL;

ALTER TABLE public.fixed_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fixed_costs_tenant_select" ON public.fixed_costs;
CREATE POLICY "fixed_costs_tenant_select"
  ON public.fixed_costs FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fixed_costs_tenant_insert" ON public.fixed_costs;
CREATE POLICY "fixed_costs_tenant_insert"
  ON public.fixed_costs FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fixed_costs_tenant_update" ON public.fixed_costs;
CREATE POLICY "fixed_costs_tenant_update"
  ON public.fixed_costs FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public._fixed_costs_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fixed_costs_touch_updated_at ON public.fixed_costs;
CREATE TRIGGER fixed_costs_touch_updated_at
  BEFORE UPDATE ON public.fixed_costs
  FOR EACH ROW EXECUTE FUNCTION public._fixed_costs_touch_updated_at();

COMMENT ON TABLE public.fixed_costs IS
  'PR-D of cashflow cost mapping plan. Recurring tenant costs (rent, software, vehicles) with cadence + next_due_date. Cashflow forecast walks every active row inside the horizon. A daily cron advances next_due_date once it crosses, so the forecast stays accurate if the owner does not open the page for days.';
